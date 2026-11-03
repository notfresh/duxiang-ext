/**
 * eventlog —— 多端同步事件流客户端（读享 Chrome 插件）
 *
 * 实现 event-log-sync-protocol 协议（PROTOCOL.md §10.5 多端双向部署：
 * 服务端作防丢失管道）。
 *
 * 设计要点：
 *   · 本模块是「事件流」的唯一实现处 —— 事件 id 计算、事件落库、游标推进、
 *     折叠规则都只在这里，其它模块不碰这些细节。
 *   · 配置（serverUrl / secret / deviceId）由本模块自己从 settings store 读，
 *     不依赖 js/settings.js —— 避免 storage.js ↔ settings.js 形成环向依赖。
 *   · entity_id 用 link 的 url（协议语义：同一 topic 内 entity_id 全局唯一）。
 *     url 跨设备必然一致，且插件端 links 表 url 本来就是 unique 索引。
 *   · 冲突合并用「字段级 LWW」：事件带 old（变更前快照）和 data（变更后
 *     快照），diff 出来的字段才覆盖 —— 两端同时改同一链接的不同字段时不会
 *     互相盖掉。old 缺失时退化为实体级 LWW（PROTOCOL §5.4）。
 *
 * 依赖方向：js/storage.js → js/eventlog.js（本模块不 import storage.js）。
 */

import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  EVENT_STORE_NAME,
  SYNC_POINT_STORE_NAME,
  ENTITY_STATE_STORE_NAME,
  SETTINGS_STORE_NAME,
  SETTINGS_KEY,
} from './db-constants.js';
import { ensureAllStores } from './db-schema.js';
import { parseTags, tagsArrayToString } from './utils.js';

/** 事件 topic —— 与 Android 端一致，两端落在同一个事件流里。 */
export const TOPIC_LINKS = 'links';

/** 推/拉游标 key 前缀。含 server_url，换服务器不丢进度（PROTOCOL §10.5）。 */
const PUSH_CURSOR_PREFIX = 'push';
const PULL_CURSOR_PREFIX = 'pull';

/** 单次 POST 的最大条数（服务端上限 1000，PROTOCOL §4.1）。 */
const MAX_BATCH = 1000;

/** 单次 GET 的最大条数（服务端上限 10000，PROTOCOL §4.2）。 */
const MAX_LIMIT = 10000;

/** 落库即自动推送的防抖间隔（毫秒）。 */
export const AUTO_PUSH_DEBOUNCE_MS = 1500;

/** 参与同步的 link 字段（两端共有）。plugins 用 pinned，Android 用 is_pinned。 */
const SYNCED_FIELDS = ['title', 'url', 'tags', 'timestamp', 'pinned'];

// ============================ 小工具 ============================

/**
 * ISO-8601 本地时区时间戳（带 +HH:MM 偏移）—— event_time 用。
 * 例：2026-09-03T14:23:25.123+08:00
 */
export function formatLocalIso8601(millis) {
  const d = new Date(millis);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const tz = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${tz}`;
}

/**
 * ISO-8601 UTC 时间戳（Z 后缀）—— 本地 process_time 用。
 * 例：2026-09-03T06:23:25.123Z
 *
 * 注意：本地 process_time 只用于**本端的 push 游标**（PROTOCOL §10.5 PUSH
 * 流程）。服务端会用它自己的入库时刻覆盖，跨端排序以服务端为准。
 */
export function formatUtcIso8601(millis) {
  return new Date(millis).toISOString();
}

/** ISO-8601 字符串 → 毫秒时间戳。解析失败返回 0。 */
export function parseIso8601(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 计算事件 id —— PROTOCOL §3.1。
 *
 *   id = sha256(topic|device_id|event_time|entity_id|action) 前 16 位
 *
 * 两端（插件 / Android）必须算出**逐字符相同**的值，否则服务端幂等失效、
 * 拉取去重失效。这是跨端兼容的命门，改动本函数前先看
 * tests/eventlog-id-vector.js。
 */
export async function computeEventId(topic, deviceId, eventTime, entityId, action) {
  const raw = `${topic}|${deviceId}|${eventTime}|${entityId}|${action}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

// ============================ IndexedDB ============================

let dbPromise = null;

/**
 * 打开数据库（独立连接，不复用 storage.js 的）。
 *
 * 为什么独立：storage.js 已经持有一个连接；同一页面里两个连接指向同一库
 * 时，版本升级容易被阻塞（见 js/idb.js 里 onblocked 的告警）。eventlog
 * 自己开一个连接，换库版本时互不干扰。
 */
async function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        // 建齐所有 store —— schema 单一来源（js/db-schema.js）。
        // 本连接可能比 storage.js 先打开（那时 links 表还没建），所以不能
        // 只建自己的三个 store。
        ensureAllStores(db);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        console.warn('[eventlog] 数据库升级被阻塞 —— 其它标签页可能开着旧连接');
      };
    });
  }
  return dbPromise;
}

/** 在指定 store 上执行一次事务，返回事务完成后的结果。 */
async function withStore(storeName, mode, fn) {
  const db = await getDB();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);
  const result = await fn(store);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return result;
}

/** 读一条记录。 */
function reqGet(store, key) {
  return new Promise((resolve, reject) => {
    const r = store.get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** 写一条记录（put）。 */
function reqPut(store, value) {
  return new Promise((resolve, reject) => {
    const r = store.put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** 读游标值。 */
async function getCursor(key) {
  const rec = await withStore(SYNC_POINT_STORE_NAME, 'readonly', (s) => reqGet(s, key));
  return rec ? rec.value : null;
}

/** 写游标值。 */
async function setCursor(key, value) {
  await withStore(SYNC_POINT_STORE_NAME, 'readwrite', (s) =>
    reqPut(s, { key, value, updatedAt: new Date().toISOString() }));
}

/**
 * 读一条 sync_point（对外给编排层用）。
 *
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getSyncPoint(key) {
  return getCursor(key);
}

/**
 * 写一条 sync_point（对外给编排层用）。
 */
export async function setSyncPoint(key, value) {
  await setCursor(key, value);
}

// ============================ 配置 ============================

/**
 * 读同步配置 —— 直接从 settings store 取，不 import js/settings.js。
 *
 * settings.js 依赖 storage.js（取 DB 连接），storage.js 又要调本模块埋点。
 * 若本模块再 import settings.js 就成了环。本模块是叶子节点，自己读
 * settings store 是唯一不产生环的做法。
 */
export async function loadSyncConfig() {
  try {
    const db = await getDB();
    const tx = db.transaction(SETTINGS_STORE_NAME, 'readonly');
    const rec = await new Promise((resolve, reject) => {
      const r = tx.objectStore(SETTINGS_STORE_NAME).get(SETTINGS_KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const s = (rec && rec.value) || {};
    return {
      serverUrl: (s.syncPeerUrl || '').trim(),
      secret: (s.syncSecret || '').trim(),
      deviceId: (s.deviceId || '').trim(),
    };
  } catch (error) {
    console.warn('[eventlog] 读取配置失败:', error.message);
    return { serverUrl: '', secret: '', deviceId: '' };
  }
}

/** 配置是否完整（能推能拉）。 */
export async function isSyncConfigured() {
  const cfg = await loadSyncConfig();
  return !!(cfg.serverUrl && cfg.secret && cfg.deviceId);
}

/** 去掉 URL 末尾的斜杠，方便拼路径。 */
function normalizeBase(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

// ============================ 事件落库 ============================

/** 本地 process_time 分配器 —— 同 topic 内严格递增（PROTOCOL §10.5 PUSH）。 */
let lastProcessMillis = -1;

function nextProcessTime() {
  let ms = Date.now();
  if (ms <= lastProcessMillis) {
    ms = lastProcessMillis + 1;
  }
  lastProcessMillis = ms;
  return formatUtcIso8601(ms);
}

/**
 * 记录一条事件（唯一埋点入口）。
 *
 * @param {string} topic
 * @param {string} entityId  实体的跨端身份（links topic = url）
 * @param {'create'|'update'|'delete'} action
 * @param {object|null} data      变更后状态（delete 传 null）
 * @param {object|null} old       变更前状态（create 传 null）
 * @param {number} eventTimeMillis 实体的真实发生时刻
 * @returns {Promise<object|null>} 落库的事件记录
 */
export async function record(topic, entityId, action, data, old, eventTimeMillis) {
  if (!topic || !entityId) {
    throw new Error('[eventlog] topic / entityId 不能为空');
  }
  const cfg = await loadSyncConfig();
  if (!cfg.deviceId) {
    console.warn('[eventlog] 未配置 deviceId，跳过事件记录');
    return null;
  }

  const eventTime = formatLocalIso8601(eventTimeMillis || Date.now());
  const processTime = nextProcessTime();
  const id = await computeEventId(topic, cfg.deviceId, eventTime, entityId, action);

  const rec = {
    id,
    topic,
    process_time: processTime,
    event_time: eventTime,
    device_id: cfg.deviceId,
    entity_id: entityId,
    action,
    data: data === undefined ? null : data,
    old: old === undefined ? null : old,
  };

  await withStore(EVENT_STORE_NAME, 'readwrite', (s) => reqPut(s, rec));
  scheduleAutoPush(topic);
  return rec;
}

/**
 * 取某实体上一条带 data 的事件 —— 用来推导 old（变更前快照）。
 *
 * 与折叠同源，所以埋点处不必各自传快照。create 没有「之前」→ old 为 null。
 */
async function latestDataJson(topic, entityId) {
  const db = await getDB();
  const tx = db.transaction(EVENT_STORE_NAME, 'readonly');
  const index = tx.objectStore(EVENT_STORE_NAME).index('entity');
  const range = IDBKeyRange.bound([topic, entityId], [topic, entityId]);
  const rows = await new Promise((resolve, reject) => {
    const r = index.getAll(range);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  const withData = rows.filter(x => x.data !== null && x.data !== undefined);
  if (withData.length === 0) return null;
  withData.sort((a, b) => (a.process_time < b.process_time ? -1 : 1));
  return withData[withData.length - 1].data;
}

// ============================ link 事件封装 ============================

/**
 * 把 link 记录转成同步 payload（只含两端共有的字段）。
 *
 * ============================ 跨端 wire 格式 ============================
 * 协议层的字段类型是**规范化的**，两端必须逐字节一致，否则字段级 LWW 的
 * diff 会误判（同样的值在不同端表示不同 → 每次都算「改了」）。
 *
 *   字段        协议类型          插件本地存储         Android 本地存储
 *   ─────────────────────────────────────────────────────────────────────
 *   title       string            string              string
 *   url         string            string              string
 *   tags        string[]          "a,b" 逗号串         List<String>
 *   timestamp   number (epoch ms) ISO-8601 字符串      long 毫秒
 *   pinned      boolean           boolean             boolean (is_pinned)
 *
 * 两处踩坑：
 *   1. 插件本地 tags 是**逗号分隔字符串**，不是数组 —— 直接取会永远是 []，
 *      标签就静默不同步了。
 *   2. 插件本地 timestamp 是 **ISO-8601 字符串**，Android 是 epoch 毫秒 ——
 *      不统一的话「按 timestamp 取最新一条去重」在插件侧算不对。
 */
function toLinkPayload(link) {
  return toWire(link);
}

/**
 * 把各种形态的时间戳统一成 epoch 毫秒。
 * 已经是数字的直接用；ISO 字符串解析；都没有就用现在。
 */
function toEpochMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    // 纯数字字符串
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;
  }
  return Date.now();
}

/**
 * 插件本地 link 记录 → 协议层（wire）格式。
 *
 * 这是 wire 格式的**唯一**定义处 —— 埋点（toLinkPayload）和折叠
 * （link-applier 的 fromWire）都走这里，两边不会走偏。
 *
 * @param {object} link 插件本地记录
 * @returns {object} 协议层 payload
 */
export function toWire(link) {
  return {
    title: link.title || '',
    url: link.url || '',
    tags: parseTags(link.tags),
    timestamp: toEpochMillis(link.timestamp),
    pinned: !!link.pinned,
  };
}

/**
 * 协议层（wire）payload → 插件本地 link 记录。
 *
 * @param {object} payload 协议层 payload
 * @returns {object} 插件本地记录
 */
export function fromWire(payload) {
  if (!payload) return null;
  return {
    title: payload.title || '',
    url: payload.url || '',
    tags: tagsArrayToString(payload.tags),
    timestamp: typeof payload.timestamp === 'number'
      ? new Date(payload.timestamp).toISOString()
      : (payload.timestamp || new Date().toISOString()),
    pinned: !!payload.pinned,
  };
}

/**
 * 记录一条 link 事件（storage.js 埋点调它）。
 *
 * @param {object} link     当前 link 记录
 * @param {'create'|'update'|'delete'} action
 * @param {object|null} previous 变更前的 link 记录（用来算 old）
 */
export async function recordLink(link, action, previous) {
  const url = (link && link.url ? link.url : '').trim();
  if (!url) {
    console.warn('[eventlog] link 没有 url，跳过事件记录');
    return null;
  }
  const entityId = url; // entity_id = url（跨端身份）
  const data = action === 'delete' ? null : toLinkPayload(link);

  let old = null;
  if (action !== 'create') {
    if (previous) {
      old = toLinkPayload(previous);
    } else {
      const last = await latestDataJson(TOPIC_LINKS, entityId);
      old = last ? last : null;
    }
  }

  const eventTime = action === 'create'
    ? parseIso8601(link.timestamp) || Date.now()
    : Date.now();

  try {
    return await record(TOPIC_LINKS, entityId, action, data, old, eventTime);
  } catch (error) {
    // 埋点失败绝不能影响业务操作
    console.error('[eventlog] 记录 link 事件失败:', error.message);
    return null;
  }
}

// ============================ 推送 ============================

let autoPushTimer = null;
let autoPushPending = false;

/**
 * 落库后安静一会儿再推一批（防抖合并）。
 *
 * 批量导入 1000 条只推一次，不是 1000 次 HTTP 请求。
 */
export function scheduleAutoPush(topic) {
  if (autoPushPending) return; // 已有一次排在队里 → 合并掉
  autoPushPending = true;
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(() => {
    autoPushPending = false;
    autoPushTimer = null;
    pushPending(topic).catch((err) => {
      console.warn('[eventlog] 自动推送失败（下次重试）:', err.message);
    });
  }, AUTO_PUSH_DEBOUNCE_MS);
}

/** 游标 key —— 含 server_url，换服务器不丢进度。 */
function pushCursorKey(serverUrl, topic) {
  return `${PUSH_CURSOR_PREFIX}:${serverUrl}:${topic}`;
}

function pullCursorKey(serverUrl, topic) {
  return `${PULL_CURSOR_PREFIX}:${serverUrl}:${topic}`;
}

/**
 * 取本地待推事件（process_time > 游标，按 process_time 升序）。
 */
async function sinceByProcessTime(topic, since, limit) {
  const db = await getDB();
  const tx = db.transaction(EVENT_STORE_NAME, 'readonly');
  const index = tx.objectStore(EVENT_STORE_NAME).index('topic_process');
  const range = IDBKeyRange.bound([topic, since || ''], [topic, '￿']);
  const rows = await new Promise((resolve, reject) => {
    const r = index.getAll(range);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
  rows.sort((a, b) => (a.process_time < b.process_time ? -1 : 1));
  return rows.slice(0, limit);
}

/**
 * 把本地待推事件推给服务端（PROTOCOL §10.5 PUSH 流程）。
 *
 * 整批原子推进游标：POST 成功才推进，失败不动 —— 下轮重推同一批，
 * 服务端按 id 幂等兜底。
 *
 * @returns {Promise<number>} 推送条数；失败返回 -1
 */
export async function pushPending(topic = TOPIC_LINKS) {
  const cfg = await loadSyncConfig();
  if (!cfg.serverUrl || !cfg.secret || !cfg.deviceId) {
    return 0; // 未配置同步：静默跳过
  }
  const base = normalizeBase(cfg.serverUrl);
  const cursorKey = pushCursorKey(base, topic);
  let cursor = await getCursor(cursorKey);
  let totalSent = 0;

  for (let loop = 0; loop < 10000; loop++) {
    const batch = await sinceByProcessTime(topic, cursor, MAX_BATCH);
    if (batch.length === 0) break;

    const body = {
      events: batch.map(e => ({
        id: e.id,
        device_id: e.device_id,
        topic: e.topic,
        entity_id: e.entity_id,
        action: e.action,
        event_time: e.event_time,
        process_time: e.process_time,
        data: e.data === undefined ? null : e.data,
        old: e.old === undefined ? null : e.old,
      })),
    };

    let ok = false;
    try {
      const res = await fetch(`${base}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': cfg.secret,
        },
        body: JSON.stringify(body),
      });
      ok = res.status === 200 || res.status === 201;
      if (!ok) {
        console.warn('[eventlog] 推送失败 HTTP', res.status);
      }
    } catch (error) {
      console.warn('[eventlog] 推送异常:', error.message);
    }

    if (!ok) {
      // 整批失败：游标不推进，下轮重推同一批
      return totalSent > 0 ? totalSent : -1;
    }

    cursor = batch[batch.length - 1].process_time;
    await setCursor(cursorKey, cursor);
    totalSent += batch.length;
  }

  return totalSent;
}

// ============================ 拉取 + 折叠 ============================

/**
 * 把远端事件折叠进本地 links 表。
 *
 * 字段级 LWW（PROTOCOL §5.4 的可选策略）：
 *   changed = diff(old, data) → 只覆盖改动过的字段
 *   old 缺失 → 退化为实体级 LWW（整条覆盖）
 *
 * 折叠需要读写 links 表 —— 由调用方注入的 applier 完成（避免本模块
 * 反向依赖 storage.js）。
 */
export async function applyRemoteEvent(event, applier) {
  if (!event || event.topic !== TOPIC_LINKS) return;
  await applier(event);
}

/**
 * 从服务端拉取事件并折叠（PROTOCOL §10.5 PULL 流程）。
 *
 * 拉到的每条事件先落进本地 event_log（按 id 去重），再折叠进 links 表，
 * 最后推进 pull 游标。游标用服务端的 process_time。
 *
 * @param {function} applier 折叠回调
 * @returns {Promise<number>} 拉取条数；失败返回 -1
 */
export async function pull(applier) {
  const cfg = await loadSyncConfig();
  if (!cfg.serverUrl || !cfg.secret || !cfg.deviceId) {
    return 0;
  }
  const base = normalizeBase(cfg.serverUrl);
  const cursorKey = pullCursorKey(base, TOPIC_LINKS);
  let cursor = await getCursor(cursorKey);
  let total = 0;

  // 照 Android 端 EventLogClient.pull：每批 1000 条，一批一个读写事务，
  // 折叠在事务内完成 —— 6027 条事件从 3 万个小事务缩到个位数大事务。
  const batchLimit = 1000;

  for (let loop = 0; loop < 100; loop++) {
    const url = `${base}/events?since=${encodeURIComponent(cursor || '')}` +
      `&topic=${encodeURIComponent(TOPIC_LINKS)}&limit=${batchLimit}`;

    let rows;
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': cfg.secret },
      });
      if (!res.ok) {
        console.warn('[eventlog] 拉取失败 HTTP', res.status);
        return total > 0 ? total : -1;
      }
      rows = await res.json();
    } catch (error) {
      console.warn('[eventlog] 拉取异常:', error.message);
      return total > 0 ? total : -1;
    }

    if (!Array.isArray(rows) || rows.length === 0) break;

    const folded = await foldBatchInTx(rows);
    total += folded;

    cursor = rows[rows.length - 1].process_time;
    await setCursor(cursorKey, cursor);

    if (rows.length < batchLimit) break;
  }

  return total;
}

/**
 * 一批事件在一个读写事务内：落 event_log + 折叠进 links + 写 entity_state。
 *
 * 照 Android LinkEventApplier 的折叠语义逐条 merge（字段级 LWW、URL 身份），
 * 但把「每条 5 个 await、5 个事务」压成「整批 1 个事务」：
 *   1. 事务内批量预读：entity_state（按事件去重）+ links（按 url 去重）
 *   2. 内存里按 process_time 升序逐条 merge（与逐条 await 完全同结果）
 *   3. 同事务写回全部变更
 *
 * @param {object[]} rows 服务端返回的一批事件（process_time 升序）
 * @returns {Promise<number>} 折叠生效的事件数
 */
async function foldBatchInTx(rows) {
  const db = await getDB();
  const tx = db.transaction([EVENT_STORE_NAME, STORE_NAME, ENTITY_STATE_STORE_NAME], 'readwrite');
  const eventStore = tx.objectStore(EVENT_STORE_NAME);
  const linkStore = tx.objectStore(STORE_NAME);
  const stateStore = tx.objectStore(ENTITY_STATE_STORE_NAME);
  const urlIndex = linkStore.index('url');

  // ---- 1. 批量预读（请求都在同一事务里发出，事务不会中途提交）----
  const seenEntities = [...new Set(rows.map(e => `${TOPIC_LINKS}|${e.entity_id}`))];
  const seenUrls = [...new Set(rows.filter(e => e.entity_id).map(e => e.entity_id))];

  const statePromises = seenEntities.map(key => new Promise((res) => {
    const r = stateStore.get(key);
    r.onsuccess = () => res([key, r.result ? r.result.state : null]);
    r.onerror = () => res([key, null]);
  }));
  const linkPromises = seenUrls.map(u => new Promise((res) => {
    const r = urlIndex.get(u);
    r.onsuccess = () => res([u, r.result || null]);
    r.onerror = () => res([u, null]);
  }));
  const stateMap = new Map(await Promise.all(statePromises));
  const linkMap = new Map(await Promise.all(linkPromises));

  // ---- 2. 内存逐条 merge ----
  let applied = 0;
  for (const e of rows) {
    // 事件落本地日志（按 id 幂等 —— put 覆盖同 id）
    eventStore.put(e);

    if (!e.entity_id) continue;
    const stateKey = `${TOPIC_LINKS}|${e.entity_id}`;
    const state = stateMap.get(stateKey);
    if (!isNewerThan(state, e)) continue; // 同 entity 的旧事件不重复应用

    if (e.action === 'delete') {
      const local = linkMap.get(e.entity_id);
      if (local) {
        linkStore.delete(local.id);
        linkMap.set(e.entity_id, null);
      }
      stateMap.set(stateKey, { process_time: e.process_time, data: null });
      applied++;
      continue;
    }

    const remote = e.data;
    if (!remote || !remote.url) continue;

    const changed = diffFields(e.old, remote);
    const localWire = linkMap.get(e.entity_id) ? toWire(linkMap.get(e.entity_id)) : null;
    const mergedWire = localWire
      ? mergeByFields(localWire, remote, changed)
      : remote;
    const record = fromWire(mergedWire);

    // put 返回 key，回填 id 供后续事件在同批内继续 merge
    const putReq = linkStore.put(record);
    putReq.onsuccess = () => { record.id = putReq.result; };
    linkMap.set(e.entity_id, record);

    stateMap.set(stateKey, { process_time: e.process_time, data: remote });
    applied++;
  }

  // ---- 3. 写回 entity_state（links 已在上面 put/delete）----
  for (const [key, st] of stateMap) {
    if (!st) continue;
    stateStore.put({
      key,
      state: st,
      updatedAt: new Date().toISOString(),
    });
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return applied;
}

// ============================ 维护 ============================

/** 清空本地事件日志（配合服务端清库后的重灌）。 */
export async function clearEvents() {
  await withStore(EVENT_STORE_NAME, 'readwrite', (s) =>
    new Promise((resolve, reject) => {
      const r = s.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    }));
  lastProcessMillis = -1;
}

/** 清空本地游标。 */
export async function clearSyncPoints() {
  await withStore(SYNC_POINT_STORE_NAME, 'readwrite', (s) =>
    new Promise((resolve, reject) => {
      const r = s.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    }));
}

/** 本地事件条数（调试用）。 */
export async function eventCount() {
  const db = await getDB();
  const tx = db.transaction(EVENT_STORE_NAME, 'readonly');
  return new Promise((resolve, reject) => {
    const r = tx.objectStore(EVENT_STORE_NAME).count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** 导出同步字段常量（折叠器要用同一份列表）。 */
export function syncedFields() {
  return SYNCED_FIELDS.slice();
}

// ============================ 实体状态（折叠用） ============================

/** entity_state 的 key —— topic + entity_id 组合。 */
function entityStateKey(topic, entityId) {
  return `${topic}|${entityId}`;
}

/**
 * 读实体最后应用的事件状态。
 *
 * @returns {Promise<object|null>} { process_time, data }
 */
export async function getEntityState(topic, entityId) {
  const rec = await withStore(ENTITY_STATE_STORE_NAME, 'readonly', (s) =>
    reqGet(s, entityStateKey(topic, entityId)));
  return rec ? rec.state : null;
}

/** 写实体最后应用的事件状态。 */
export async function setEntityState(topic, entityId, state) {
  await withStore(ENTITY_STATE_STORE_NAME, 'readwrite', (s) =>
    reqPut(s, {
      key: entityStateKey(topic, entityId),
      state,
      updatedAt: new Date().toISOString(),
    }));
}

/**
 * 判断一条远端事件是否比本地已应用的状态更新。
 *
 * @param {object|null} state 本地状态 { process_time, data }
 * @param {object} event 远端事件
 * @returns {boolean} true = 应当应用
 */
export function isNewerThan(state, event) {
  if (!state || !state.process_time) return true;
  return event.process_time > state.process_time;
}

/**
 * 算出两个快照之间的差异字段集合 —— 字段级 LWW 的核心（PROTOCOL §5.4）。
 *
 * @param {object|null} old 变更前快照
 * @param {object|null} data 变更后快照
 * @returns {string[]} 发生变化的字段名
 */
export function diffFields(old, data) {
  if (!data) return [];
  if (!old) {
    // old 缺失 → 退化为实体级：全部字段都算改动
    return Object.keys(data);
  }
  const changed = [];
  const keys = new Set([...Object.keys(old), ...Object.keys(data)]);
  for (const k of keys) {
    const a = old[k];
    const b = data[k];
    if (JSON.stringify(a === undefined ? null : a) !==
        JSON.stringify(b === undefined ? null : b)) {
      changed.push(k);
    }
  }
  return changed;
}

/**
 * 把远端快照的指定字段合并到本地实体上。
 *
 * @param {object} local 本地实体
 * @param {object|null} remote 远端快照
 * @param {string[]|null} fields 要覆盖的字段；null = 整体覆盖（实体级 LWW）
 * @returns {object} 合并后的实体
 */
export function mergeByFields(local, remote, fields) {
  if (!remote) return local;
  if (!fields) return { ...local, ...remote };
  const out = { ...local };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(remote, f)) {
      out[f] = remote[f];
    }
  }
  return out;
}
