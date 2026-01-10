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
    console.log(`[openDB] 打开数据库: ${dbName}, 版本: ${version}`);
    
    let blockedTimeout = null;
    
    const request = indexedDB.open(dbName, version);
    
    request.onerror = () => {
      console.error('[openDB] 打开数据库失败:', request.error);
      if (blockedTimeout) clearTimeout(blockedTimeout);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      const db = request.result;
      console.log('[openDB] 数据库打开成功，实际版本:', db.version, '期望版本:', version);
      if (blockedTimeout) clearTimeout(blockedTimeout);
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion;
      console.log(`[openDB] ⚠️ 数据库升级触发: ${oldVersion} -> ${newVersion}`);
      console.log(`[openDB] 如果版本匹配不应该触发升级，请检查版本号设置`);
      try {
        if (upgradeCallback) {
          upgradeCallback(event.target.result, oldVersion, newVersion);
        }
        console.log('[openDB] 数据库升级完成');
      } catch (error) {
        console.error('[openDB] 数据库升级失败:', error);
        if (blockedTimeout) clearTimeout(blockedTimeout);
        throw error;
      }
    };
    
    request.onblocked = () => {
      console.error('[openDB] ❌ 数据库升级被阻塞！');
      console.error('[openDB] 当前数据库版本:', request.result?.version || '未知');
      console.error('[openDB] 期望版本:', version);
      console.error('[openDB] 可能原因：');
      console.error('[openDB] 1. 其他标签页/窗口打开了数据库连接');
      console.error('[openDB] 2. 之前的数据库连接未正确关闭');
      console.error('[openDB] 3. settings.js 和 storage.js 同时打开数据库');
      console.error('[openDB] 建议：删除数据库后重新创建');
      console.error('[openDB] 在控制台运行: indexedDB.deleteDatabase("readingLinks")');
      
      // 设置超时，如果 3 秒后仍然阻塞，提示用户删除数据库
      blockedTimeout = setTimeout(() => {
        if (request.readyState === 'pending') {
          console.error('[openDB] ❌ 升级仍然被阻塞！');
          console.error('[openDB] 请立即删除数据库: indexedDB.deleteDatabase("readingLinks")');
        }
      }, 3000);
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
  console.log(`[getStore] 获取对象存储: ${storeName}, 模式: ${mode}`);
  if (!db || db.version === null) {
    console.error('[getStore] 数据库连接无效');
    throw new Error('数据库连接无效');
  }
  
  if (!db.objectStoreNames.contains(storeName)) {
    console.error(`[getStore] 对象存储 "${storeName}" 不存在，可用存储:`, Array.from(db.objectStoreNames).join(', '));
    throw new Error(`对象存储 "${storeName}" 不存在`);
  }
  
  const tx = db.transaction(storeName, mode);
  console.log(`[getStore] 事务创建成功`);
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
    console.log('[add] 添加数据:', data.url?.substring(0, 50));
    const request = store.add(data);
    request.onsuccess = () => {
      console.log('[add] 添加成功，ID:', request.result);
      resolve(request.result);
    };
    request.onerror = () => {
      console.error('[add] 添加失败:', request.error?.name, request.error?.message);
      reject(request.error);
    };
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

/**
 * 删除数据库
 * @param {string} dbName - 数据库名称
 * @returns {Promise<void>}
 */
export function deleteDB(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    
    request.onsuccess = () => {
      console.log(`数据库 "${dbName}" 删除成功`);
      resolve();
    };
    
    request.onerror = () => {
      console.error(`数据库 "${dbName}" 删除失败:`, request.error);
      reject(request.error);
    };
    
    request.onblocked = () => {
      console.warn(`数据库 "${dbName}" 删除被阻塞，请关闭所有相关连接`);
      // 等待一段时间后重试
      setTimeout(() => {
        const retryRequest = indexedDB.deleteDatabase(dbName);
        retryRequest.onsuccess = () => {
          console.log(`数据库 "${dbName}" 删除成功（重试后）`);
          resolve();
        };
        retryRequest.onerror = () => reject(retryRequest.error);
      }, 1000);
    };
  });
}

