import { put, getAll, queryIndex } from './sync-db.js';
import { generateUUIDv4 } from '../../sync-utils.js';

const LOG_STORE = 'sync_log';

export async function appendLog(entityType, entityId, operation, payload, timestamp = null) {
  const log = {
    log_id: generateUUIDv4(),
    entity_type: entityType,
    entity_id: entityId,
    operation,
    log_timestamp: timestamp || new Date().toISOString(),
    payload: payload == null ? null : payload,
  };
  await put(LOG_STORE, log);
  return log;
}

// simple implementation: fetch all logs and filter. OK for prototyping.
export async function listLogsAfter(entityType, cursor = null, limit = 200) {
  const all = await getAll(LOG_STORE);
  const filtered = all
    .filter(l => l.entity_type === entityType)
    .filter(l => (cursor ? (l.log_timestamp > cursor) : true))
    .sort((a, b) => (a.log_timestamp < b.log_timestamp ? -1 : a.log_timestamp > b.log_timestamp ? 1 : 0));
  return filtered.slice(0, limit);
}

export async function getLatestTimestamp(entityType) {
  const logs = await listLogsAfter(entityType, null, 10000);
  if (!logs || logs.length === 0) return null;
  return logs.reduce((max, l) => (l.log_timestamp > max ? l.log_timestamp : max), logs[0].log_timestamp);
}

export default { appendLog, listLogsAfter, getLatestTimestamp };
