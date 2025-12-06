/**
 * IndexedDB 封装工具
 * 提供 Promise 化的 IndexedDB API，简化使用
 */

/**
 * 打开数据库
 * @param {string} dbName - 数据库名称
 * @param {number} version - 数据库版本
 * @param {Function} upgradeCallback - 升级回调函数
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
export function openDB(dbName, version, upgradeCallback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      upgradeCallback(db, event.oldVersion, event.newVersion);
    };
  });
}

/**
 * 获取对象存储
 * @param {IDBDatabase} db - 数据库实例
 * @param {string} storeName - 对象存储名称
 * @param {string} mode - 模式：'readonly' | 'readwrite'
 * @returns {IDBObjectStore} 对象存储
 */
export function getStore(db, storeName, mode = 'readonly') {
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/**
 * 添加数据
 * @param {IDBObjectStore} store - 对象存储
 * @param {Object} data - 要添加的数据
 * @returns {Promise<IDBValidKey>} 添加的键
 */
export function add(store, data) {
  return new Promise((resolve, reject) => {
    const request = store.add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取数据
 * @param {IDBObjectStore} store - 对象存储
 * @param {IDBValidKey} key - 键
 * @returns {Promise<Object>} 数据对象
 */
export function get(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 获取所有数据
 * @param {IDBObjectStore} store - 对象存储
 * @returns {Promise<Array>} 数据数组
 */
export function getAll(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 更新/添加数据（put）
 * @param {IDBObjectStore} store - 对象存储
 * @param {Object} data - 要更新的数据
 * @returns {Promise<IDBValidKey>} 键
 */
export function put(store, data) {
  return new Promise((resolve, reject) => {
    const request = store.put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 删除数据
 * @param {IDBObjectStore} store - 对象存储
 * @param {IDBValidKey} key - 键
 * @returns {Promise<void>}
 */
export function del(store, key) {
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 通过索引获取数据
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} indexName - 索引名称
 * @param {IDBValidKey} key - 键
 * @returns {Promise<Object>} 数据对象
 */
export function getByIndex(store, indexName, key) {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const request = index.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 通过索引获取所有数据
 * @param {IDBObjectStore} store - 对象存储
 * @param {string} indexName - 索引名称
 * @returns {Promise<Array>} 数据数组
 */
export function getAllByIndex(store, indexName) {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const request = index.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

