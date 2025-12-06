/**
 * 存储模块
 * 使用 IndexedDB 进行数据存储，替代 Chrome Storage
 */

import { openDB, getStore, add, get, getAll, put, del } from './idb.js';

const DB_NAME = 'readingLinks';
const DB_VERSION = 1;
const STORE_NAME = 'links';

let dbInstance = null;

/**
 * 初始化数据库
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
async function initDB() {
  if (dbInstance) {
    return dbInstance;
  }
  
  dbInstance = await openDB(DB_NAME, DB_VERSION, (db, oldVersion, newVersion) => {
    // 创建对象存储
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      
      // 创建索引
      store.createIndex('url', 'url', { unique: true }); // URL 唯一索引
      store.createIndex('timestamp', 'timestamp'); // 时间戳索引
    }
  });
  
  return dbInstance;
}

/**
 * 从 Chrome Storage 迁移数据到 IndexedDB
 * @returns {Promise<number>} 迁移的记录数
 */
async function migrateFromChromeStorage() {
  return new Promise((resolve, reject) => {
    // 检查是否已经迁移过
    chrome.storage.local.get(['_migrated_to_indexeddb'], (result) => {
      if (result._migrated_to_indexeddb) {
        console.log('数据已迁移，跳过迁移步骤');
        resolve(0);
        return;
      }
      
      // 读取 Chrome Storage 中的数据
      chrome.storage.local.get(['readingLinks'], async (result) => {
        if (chrome.runtime.lastError) {
          console.error('读取 Chrome Storage 失败:', chrome.runtime.lastError);
          resolve(0);
          return;
        }
        
        const links = result.readingLinks || [];
        
        if (!Array.isArray(links) || links.length === 0) {
          // 标记为已迁移（即使没有数据）
          chrome.storage.local.set({ _migrated_to_indexeddb: true });
          resolve(0);
          return;
        }
        
        try {
          const db = await initDB();
          const store = getStore(db, STORE_NAME, 'readwrite');
          
          let migratedCount = 0;
          
          // 批量导入数据
          for (const link of links) {
            try {
              // 准备数据，如果没有 id 则让数据库自动生成
              const linkData = {
                title: link.title || '',
                url: link.url || '',
                tags: link.tags || '',
                timestamp: link.timestamp || new Date().toISOString()
              };
              
              // 如果原数据有 id，保留它
              if (link.id) {
                linkData.id = link.id;
              }
              
              await put(store, linkData);
              migratedCount++;
            } catch (error) {
              // 如果 URL 重复，跳过
              if (error.name === 'ConstraintError') {
                console.warn('跳过重复 URL:', link.url);
              } else {
                console.error('迁移链接失败:', error, link);
              }
            }
          }
          
          // 标记为已迁移
          chrome.storage.local.set({ _migrated_to_indexeddb: true });
          
          console.log(`成功迁移 ${migratedCount} 条记录到 IndexedDB`);
          resolve(migratedCount);
        } catch (error) {
          console.error('迁移数据失败:', error);
          reject(error);
        }
      });
    });
  });
}

/**
 * 加载所有链接
 * @returns {Promise<Array>} 链接数组
 */
export async function loadLinks() {
  try {
    const db = await initDB();
    
    // 首次加载时尝试迁移
    await migrateFromChromeStorage();
    
    const store = getStore(db, STORE_NAME, 'readonly');
    const links = await getAll(store);
    
    // 排序：置顶的在前，然后按时间戳倒序排序（最新的在前）
    return links.sort((a, b) => {
      // 先按置顶状态排序（置顶的在前）
      const aPinned = a.pinned || false;
      const bPinned = b.pinned || false;
      if (aPinned !== bPinned) {
        // 如果 a 置顶，a 排在前面（返回负数）
        // 如果 b 置顶，b 排在前面（返回正数）
        return aPinned ? -1 : 1;
      }
      
      // 如果置顶状态相同，按时间戳倒序排序
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });
  } catch (error) {
    console.error('加载链接失败:', error);
    throw error;
  }
}

/**
 * 添加链接
 * @param {Object} link - 链接对象 {title, url, tags, timestamp}
 * @returns {Promise<number>} 新添加的链接 ID
 */
export async function addLink(link) {
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readwrite');
    
    const linkData = {
      title: link.title || '',
      url: link.url || '',
      tags: link.tags || '',
      timestamp: link.timestamp || new Date().toISOString()
    };
    
    const id = await add(store, linkData);
    return id;
  } catch (error) {
    if (error.name === 'ConstraintError') {
      throw new Error('该 URL 已存在');
    }
    console.error('添加链接失败:', error);
    throw error;
  }
}

/**
 * 删除链接
 * @param {number} id - 链接 ID
 * @returns {Promise<void>}
 */
export async function deleteLink(id) {
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readwrite');
    await del(store, id);
  } catch (error) {
    console.error('删除链接失败:', error);
    throw error;
  }
}

/**
 * 更新链接
 * @param {number} id - 链接 ID
 * @param {Object} updates - 要更新的字段
 * @returns {Promise<void>}
 */
export async function updateLink(id, updates) {
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readwrite');
    
    // 先获取现有数据
    const existing = await get(store, id);
    if (!existing) {
      throw new Error('链接不存在');
    }
    
    // 合并更新
    const updated = { ...existing, ...updates, id };
    await put(store, updated);
  } catch (error) {
    if (error.name === 'ConstraintError') {
      throw new Error('该 URL 已存在');
    }
    console.error('更新链接失败:', error);
    throw error;
  }
}

/**
 * 根据 URL 查找链接
 * @param {string} url - URL
 * @returns {Promise<Object|null>} 链接对象或 null
 */
export async function getLinkByUrl(url) {
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readonly');
    const index = store.index('url');
    
    return new Promise((resolve) => {
      const request = index.get(url);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.error('查找链接失败:', error);
    return null;
  }
}

/**
 * 批量添加链接（用于导入收藏夹等场景）
 * @param {Array<Object>} links - 链接数组
 * @returns {Promise<Object>} 结果 {imported: number, skipped: number}
 */
export async function batchAddLinks(links) {
  if (!Array.isArray(links) || links.length === 0) {
    return { imported: 0, skipped: 0 };
  }
  
  const db = await initDB();
  const store = getStore(db, STORE_NAME, 'readwrite');
  
  let imported = 0;
  let skipped = 0;
  
  for (const link of links) {
    try {
      const linkData = {
        title: link.title || '',
        url: link.url || '',
        tags: link.tags || '',
        timestamp: link.timestamp || new Date().toISOString()
      };
      
      await add(store, linkData);
      imported++;
    } catch (error) {
      // 如果 URL 重复，跳过
      if (error.name === 'ConstraintError') {
        skipped++;
      } else {
        console.error('批量添加链接失败:', error, link);
        skipped++;
      }
    }
  }
  
  return { imported, skipped };
}

/**
 * 切换链接的置顶状态
 * @param {number} id - 链接 ID
 * @returns {Promise<void>}
 */
export async function togglePinLink(id) {
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readwrite');
    
    // 先获取现有数据
    const existing = await get(store, id);
    if (!existing) {
      throw new Error('链接不存在');
    }
    
    // 切换置顶状态
    const updated = { ...existing, pinned: !existing.pinned, id };
    await put(store, updated);
  } catch (error) {
    console.error('切换置顶状态失败:', error);
    throw error;
  }
}

/**
 * 导出所有链接
 * @returns {Promise<Array>} 链接数组
 */
export async function exportLinks() {
  return await loadLinks();
}

