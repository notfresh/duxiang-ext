/**
 * OpLog 数据模型
 *
 * Change  — 针对单个对象的一次完整变更快照
 * Op      — 一次提交单元，包含 1..N 个 Change，是同步的最小原子单位
 *
 * 所有字段语义见 dev-docs/同步协议设计细节.md
 */

import { syncUtils } from './sync.js';

const { computeObjectHash, computeOpId, normalizeParents, GENESIS_OP_ID } = syncUtils;

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

/** 合法的 action 值 */
export const ACTION = Object.freeze({ NEW: 'new', UPDATE: 'update', DELETE: 'delete' });

/**
 * 构造一个 Change 对象。
 *
 * Change.data 必须是对象的完整内容快照（非增量 diff）。
 * 对于 delete action，data 和 hash 均为 null。
 *
 * @param {string} targetId   - 目标对象的全局 UUID
 * @param {'new'|'update'|'delete'} action
 * @param {object|null} data  - 完整业务内容（delete 时传 null）
 * @returns {Promise<Change>}
 */
export async function createChange(targetId, action, data) {
  if (!Object.values(ACTION).includes(action)) {
    throw new Error(`createChange: invalid action "${action}"`);
  }
  if (action !== ACTION.DELETE && (data === null || data === undefined)) {
    throw new Error(`createChange: data is required for action "${action}"`);
  }

  const isDelete = action === ACTION.DELETE;
  const hash = isDelete ? null : await computeObjectHash(targetId, data);

  /** @type {Change} */
  const change = {
    target_id: targetId,
    action,
    data: isDelete ? null : data,
    hash,
  };
  return change;
}

// ---------------------------------------------------------------------------
// Op
// ---------------------------------------------------------------------------

/**
 * 构造一个 Op 并计算其 op_id。
 *
 * @param {string}   deviceId  - 当前设备 ID
 * @param {string[]} parents   - 父 op_id 列表（空数组 → 自动规范化为 [GENESIS_OP_ID]）
 * @param {Change[]} changes   - 至少一个 Change
 * @param {string}   [timestamp] - ISO8601 时间戳（默认当前时间）
 * @returns {Promise<Op>}
 */
export async function createOp(deviceId, parents, changes, timestamp) {
  if (!deviceId) throw new Error('createOp: deviceId is required');
  if (!changes || changes.length === 0) throw new Error('createOp: at least one Change is required');

  const ts = timestamp || new Date().toISOString();
  const normParents = normalizeParents(parents);

  // delete change 的 hash 用空字符串占位（与 computeOpId 保持一致）
  const changeHashes = changes.map(c => c.hash ?? '');

  const opId = await computeOpId(deviceId, ts, normParents, changeHashes);

  /** @type {Op} */
  const op = {
    op_id: opId,
    device_id: deviceId,
    parents: normParents,
    timestamp: ts,
    changes,
  };
  return op;
}

// ---------------------------------------------------------------------------
// Validation helpers（在 apply/push 路径中使用）
// ---------------------------------------------------------------------------

/**
 * 校验一个 Change 对象结构是否合法（轻量检查，不重新计算哈希）。
 * @param {Change} change
 * @returns {boolean}
 */
export function validateChange(change) {
  if (!change || typeof change !== 'object') return false;
  if (!change.target_id || typeof change.target_id !== 'string') return false;
  if (!Object.values(ACTION).includes(change.action)) return false;
  if (change.action !== ACTION.DELETE) {
    if (!change.data || typeof change.data !== 'object') return false;
    if (!change.hash || typeof change.hash !== 'string') return false;
  }
  return true;
}

/**
 * 校验一个 Op 对象结构是否合法（轻量检查，不重新计算 op_id）。
 * @param {Op} op
 * @returns {boolean}
 */
export function validateOp(op) {
  if (!op || typeof op !== 'object') return false;
  if (!op.op_id || typeof op.op_id !== 'string') return false;
  if (!op.device_id || typeof op.device_id !== 'string') return false;
  if (!Array.isArray(op.parents) || op.parents.length === 0) return false;
  if (!op.timestamp || typeof op.timestamp !== 'string') return false;
  if (!Array.isArray(op.changes) || op.changes.length === 0) return false;
  if (!op.changes.every(validateChange)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Replay helper
// ---------------------------------------------------------------------------

/**
 * 从 ops 列表中回放出每个对象的最终状态（类比 Raft 状态机 apply）。
 *
 * 注意：ops 必须已按拓扑顺序排序（父先于子）。
 * 仅用于脱离应用层独立重建状态（如调试/快照），正常流程由应用层 apply 回调处理。
 *
 * @param {Op[]} ops - 已排序的 op 列表
 * @returns {Map<string, object|null>} targetId → 当前 data（delete 后为 null）
 */
export function replayOps(ops) {
  /** @type {Map<string, object|null>} */
  const state = new Map();
  for (const op of ops) {
    for (const change of op.changes) {
      if (change.action === ACTION.DELETE) {
        state.set(change.target_id, null);
      } else {
        state.set(change.target_id, change.data);
      }
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// JSDoc types（仅供编辑器推断，无运行时效果）
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Change
 * @property {string}        target_id
 * @property {'new'|'update'|'delete'} action
 * @property {object|null}   data     - 完整对象快照（delete 时为 null）
 * @property {string|null}   hash     - data 的 SHA-256 hex（delete 时为 null）
 */

/**
 * @typedef {object} Op
 * @property {string}   op_id
 * @property {string}   device_id
 * @property {string[]} parents
 * @property {string}   timestamp
 * @property {Change[]} changes
 * @property {string}   [signature]
 */
