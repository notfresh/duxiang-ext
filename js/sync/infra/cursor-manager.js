import { put, get } from './sync-db.js';

const CURSOR_STORE = 'sync_cursor';
const DEFAULT_CURSOR = '2000-01-01T00:00:00.000Z';

function makeKey(peerId, entityType, direction) {
  return `${peerId}#${entityType}#${direction}`;
}

export async function saveCursor(peerId, entityType, direction, cursor) {
  const key = makeKey(peerId, entityType, direction);
  return put(CURSOR_STORE, { cursor_key: key, peer_id: peerId, entity_type: entityType, direction, cursor });
}

export async function getCursor(peerId, entityType, direction) {
  const key = makeKey(peerId, entityType, direction);
  const rec = await get(CURSOR_STORE, key);
  return rec ? rec.cursor : DEFAULT_CURSOR;
}

export async function getPullCursor(peerId, entityType) { return getCursor(peerId, entityType, 'pull'); }
export async function savePullCursor(peerId, entityType, cursor) { return saveCursor(peerId, entityType, 'pull', cursor); }

export async function getPushCursor(peerId, entityType) { return getCursor(peerId, entityType, 'push'); }
export async function savePushCursor(peerId, entityType, cursor) { return saveCursor(peerId, entityType, 'push', cursor); }

export default { getPullCursor, savePullCursor, getPushCursor, savePushCursor };
