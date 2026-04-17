import { openDB } from '../../idb.js';

const SYNC_DB_NAME = 'readingLinks_sync';
const SYNC_DB_VERSION = 1;

let _db = null;

export async function initSyncDB() {
  if (_db) return _db;
  _db = await openDB(SYNC_DB_NAME, SYNC_DB_VERSION, (db, oldVersion, newVersion) => {
    if (oldVersion < 1) {
      const logStore = db.createObjectStore('sync_log', { keyPath: 'log_id' });
      logStore.createIndex('log_timestamp', 'log_timestamp');
      logStore.createIndex('entity_type', 'entity_type');

      db.createObjectStore('sync_cursor', { keyPath: 'cursor_key' });
      db.createObjectStore('sync_peer', { keyPath: 'peer_id' });
    }
  });
  return _db;
}

function req(idbRequest) {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error);
  });
}

export function db() {
  if (!_db) throw new Error('[sync-db] DB not initialized. Call initSyncDB() first.');
  return _db;
}

export async function put(storeName, value) {
  const database = await initSyncDB();
  const tx = database.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const res = await req(store.put(value));
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('transaction aborted'));
  });
  return res;
}

export async function get(storeName, key) {
  const database = await initSyncDB();
  const store = database.transaction(storeName, 'readonly').objectStore(storeName);
  return req(store.get(key));
}

export async function getAll(storeName) {
  const database = await initSyncDB();
  const store = database.transaction(storeName, 'readonly').objectStore(storeName);
  return req(store.getAll());
}

export async function queryIndex(storeName, indexName, range) {
  const database = await initSyncDB();
  const index = database.transaction(storeName, 'readonly').objectStore(storeName).index(indexName);
  return req(index.getAll(range));
}
