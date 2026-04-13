/**
 * sync/storage.js — 同步层 IndexedDB 持久化
 *
 * 只存三张表（对应 Raft 日志层，不持有业务对象）：
 *   ops       — 已接受的 Op 记录（keyPath: op_id）
 *   heads     — 当前 head op_id 集合（单行 key='heads'）
 *   pending   — 尚未被服务器 accept 的 Op（keyPath: op_id）
 *
 * 使用独立 DB（readingLinks_sync），不干扰主业务 DB（readingLinks）。
 * 调用任何方法前需先调用 initSyncDB() 或确保 DB 已经打开。
 */

import { openDB } from '../../js/idb.js';

// ---------------------------------------------------------------------------
// DB 配置
// ---------------------------------------------------------------------------

const SYNC_DB_NAME = 'readingLinks_sync';
const SYNC_DB_VERSION = 1;

const STORE_OPS     = 'ops';
const STORE_HEADS   = 'heads';
const STORE_PENDING = 'pending';

/** @type {IDBDatabase|null} */
let _db = null;

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 打开（并在必要时升级）同步 DB。
 * 幂等：多次调用只打开一次。
 * @returns {Promise<IDBDatabase>}
 */
export async function initSyncDB() {
  if (_db) return _db;
  _db = await openDB(SYNC_DB_NAME, SYNC_DB_VERSION, (db, oldVersion) => {
    // v1: 创建全部 store
    if (oldVersion < 1) {
      // ops store：key = op_id
      const opsStore = db.createObjectStore(STORE_OPS, { keyPath: 'op_id' });
      opsStore.createIndex('device_id', 'device_id');
      opsStore.createIndex('timestamp', 'timestamp');

      // heads store：单行记录，key = 'heads'，value = { key:'heads', op_ids:[...] }
      db.createObjectStore(STORE_HEADS, { keyPath: 'key' });

      // pending store：key = op_id
      const pendingStore = db.createObjectStore(STORE_PENDING, { keyPath: 'op_id' });
      pendingStore.createIndex('timestamp', 'timestamp'); // 按时间排序重试
    }
  });
  return _db;
}

/** 获取已打开的 DB，未初始化时抛出 */
function db() {
  if (!_db) throw new Error('[sync/storage] DB not initialized. Call initSyncDB() first.');
  return _db;
}

// ---------------------------------------------------------------------------
// 内部：idbRequest → Promise
// ---------------------------------------------------------------------------

function req(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror  = () => reject(idbRequest.error);
  });
}

// ---------------------------------------------------------------------------
// ops — 已接受的操作日志
// ---------------------------------------------------------------------------

/**
 * 原子地写入一个 Op 并更新 heads。
 *
 * 步骤（单个 IDB 事务保证原子性）：
 *   1. 若 op 已存在则幂等返回（ignore）
 *   2. put op 到 ops store
 *   3. 读取当前 heads，移除 op.parents，加入 op.op_id
 *
 * @param {import('./OpLog.js').Op} op
 * @returns {Promise<void>}
 */
export async function putOp(op) {
  const transaction = db().transaction([STORE_OPS, STORE_HEADS], 'readwrite');
  const opsStore   = transaction.objectStore(STORE_OPS);
  const headsStore = transaction.objectStore(STORE_HEADS);

  // 幂等检查
  const existing = await req(opsStore.get(op.op_id));
  if (existing) return; // 已存在，跳过

  // 写 op
  await req(opsStore.put(op));

  // 更新 heads
  const headsRow = await req(headsStore.get('heads'));
  const currentHeads = new Set(headsRow?.op_ids ?? []);
  for (const parent of op.parents) currentHeads.delete(parent);
  currentHeads.add(op.op_id);
  await req(headsStore.put({ key: 'heads', op_ids: [...currentHeads] }));

  // 等待事务完成
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror    = () => reject(transaction.error);
    transaction.onabort    = () => reject(new Error('putOp transaction aborted'));
  });
}

/**
 * 根据 op_id 获取单条 Op。
 * @param {string} opId
 * @returns {Promise<import('./OpLog.js').Op|undefined>}
 */
export async function getOp(opId) {
  const store = db().transaction(STORE_OPS, 'readonly').objectStore(STORE_OPS);
  return req(store.get(opId));
}

/**
 * 获取所有已存储的 Op（按 timestamp 索引升序）。
 * 主要用于调试/快照；正常 pull 路径使用 listOpsSince。
 * @returns {Promise<import('./OpLog.js').Op[]>}
 */
export async function getAllOps() {
  const store = db().transaction(STORE_OPS, 'readonly').objectStore(STORE_OPS);
  const index = store.index('timestamp');
  return req(index.getAll());
}

/**
 * 获取 timestamp 大于 sinceTimestamp 的所有 Op（用于增量 pull）。
 * @param {string} sinceTimestamp - ISO8601
 * @returns {Promise<import('./OpLog.js').Op[]>}
 */
export async function listOpsSince(sinceTimestamp) {
  const store = db().transaction(STORE_OPS, 'readonly').objectStore(STORE_OPS);
  const index = store.index('timestamp');
  const range = IDBKeyRange.lowerBound(sinceTimestamp, true); // exclusive
  return req(index.getAll(range));
}

// ---------------------------------------------------------------------------
// heads — 当前 DAG 头部
// ---------------------------------------------------------------------------

/**
 * 获取当前 heads（op_id 数组）。
 * 若尚无任何 op，返回空数组（语义等同 GENESIS）。
 * @returns {Promise<string[]>}
 */
export async function getHeads() {
  const store = db().transaction(STORE_HEADS, 'readonly').objectStore(STORE_HEADS);
  const row = await req(store.get('heads'));
  return row?.op_ids ?? [];
}

/**
 * 直接覆写 heads（用于快照恢复或测试）。
 * 正常情况下由 putOp 自动维护，不应手动调用。
 * @param {string[]} opIds
 * @returns {Promise<void>}
 */
export async function setHeads(opIds) {
  const store = db().transaction(STORE_HEADS, 'readwrite').objectStore(STORE_HEADS);
  await req(store.put({ key: 'heads', op_ids: opIds }));
}

// ---------------------------------------------------------------------------
// pending — 待服务器 accept 的 Op 队列
// ---------------------------------------------------------------------------

/**
 * 将一个 Op 加入待推送队列。
 * 若已存在相同 op_id 则幂等忽略。
 * @param {import('./OpLog.js').Op} op
 * @returns {Promise<void>}
 */
export async function putPendingOp(op) {
  const store = db().transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING);
  await req(store.put(op)); // put 本身幂等（同 key 覆盖）
}

/**
 * 获取所有待推送的 Op，按 timestamp 升序（先产生的先推）。
 * @returns {Promise<import('./OpLog.js').Op[]>}
 */
export async function getPendingOps() {
  const store = db().transaction(STORE_PENDING, 'readonly').objectStore(STORE_PENDING);
  const index = store.index('timestamp');
  return req(index.getAll());
}

/**
 * 从待推送队列中移除一个 Op（服务器已 accept）。
 * @param {string} opId
 * @returns {Promise<void>}
 */
export async function markPendingAccepted(opId) {
  const store = db().transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING);
  await req(store.delete(opId));
}

/**
 * 清空待推送队列（例如全量 reset 后使用）。
 * @returns {Promise<void>}
 */
export async function clearPendingOps() {
  const store = db().transaction(STORE_PENDING, 'readwrite').objectStore(STORE_PENDING);
  await req(store.clear());
}
