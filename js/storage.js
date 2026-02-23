/**
 * 存储模块
 * 使用 IndexedDB 进行数据存储，替代 Chrome Storage
 */

import { openDB, getStore, add, get, getAll, put, del, deleteDB } from './idb.js';
import { parseTags, tagsArrayToString } from './utils.js';

const DB_NAME = 'readingLinks';
const DB_VERSION = 2; // 使用版本 2，避免升级阻塞问题

const STORE_NAME = 'links';
const GROUPS_STORE_NAME = 'groups'; // 新增分组对象存储

let dbInstance = null;

/**
 * 获取数据库实例（供其他模块使用，避免重复打开）
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
export async function getDBInstance() {
  return await initDB();
}

/**
 * 初始化数据库
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
async function initDB() {
  console.log('[initDB] 开始初始化数据库');
  if (dbInstance) {
    try {
      // 检查连接是否有效
      if (dbInstance.version === null) {
        console.log('[initDB] 数据库连接已关闭，重新初始化');
        dbInstance.close();
        dbInstance = null;
      } else {
        console.log('[initDB] 使用现有数据库连接，版本:', dbInstance.version);
        return dbInstance;
      }
    } catch (error) {
      console.warn('[initDB] 数据库连接检查失败:', error);
      if (dbInstance) {
        try {
          dbInstance.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
      dbInstance = null;
    }
  }
  
  try {
    console.log(`[initDB] 打开数据库: ${DB_NAME}, 版本: ${DB_VERSION}`);
    dbInstance = await openDB(DB_NAME, DB_VERSION, (db, oldVersion, newVersion) => {
      console.log(`[initDB] 数据库升级: ${oldVersion} -> ${newVersion}`);
      
      // 创建链接对象存储（如果不存在）
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log(`[initDB] 创建对象存储: ${STORE_NAME}`);
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('url', 'url', { unique: true });
        store.createIndex('timestamp', 'timestamp');
      }
      // 创建分组对象存储（如果不存在）
      if (!db.objectStoreNames.contains(GROUPS_STORE_NAME)) {
        console.log(`[initDB] 创建对象存储: ${GROUPS_STORE_NAME}`);
        db.createObjectStore(GROUPS_STORE_NAME, { keyPath: 'groupId' });
      }
      
      // 版本2：创建设置对象存储
      if (oldVersion < 2 && newVersion >= 2) {
        if (!db.objectStoreNames.contains('settings')) {
          console.log('[initDB] 创建对象存储: settings');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
      
      // 如果存在 tabGroups 对象存储，尝试删除（不强制，避免升级问题）
      if (db.objectStoreNames.contains('tabGroups')) {
        try {
          console.log('[initDB] 检测到 tabGroups 对象存储，尝试删除');
          db.deleteObjectStore('tabGroups');
          console.log('[initDB] tabGroups 删除成功');
        } catch (error) {
          console.warn('[initDB] 删除 tabGroups 失败（可能正在使用中）:', error);
          // 不抛出错误，继续执行
        }
      }
      
      console.log(`[initDB] 升级完成，当前对象存储: ${Array.from(db.objectStoreNames).join(', ')}`);
    });
    
    console.log('[initDB] 数据库初始化成功，版本:', dbInstance.version);
    console.log('[initDB] 对象存储:', Array.from(dbInstance.objectStoreNames).join(', '));
    
    // 检查关键对象存储是否存在，如果不存在则强制升级
    if (!dbInstance.objectStoreNames.contains(STORE_NAME) || !dbInstance.objectStoreNames.contains(GROUPS_STORE_NAME)) {
      console.warn('[initDB] ⚠️ 检测到对象存储不存在，强制重建数据库');
      dbInstance.close();
      dbInstance = null;
      
      // 删除旧数据库，重新创建
      try {
        await deleteDB(DB_NAME);
        console.log('[initDB] 已删除旧数据库，等待重新创建...');
        // 等待一小段时间，确保删除完成
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn('[initDB] 删除数据库失败:', error);
      }
      
      // 重新打开数据库（会触发升级，创建对象存储）
      // 使用新的版本号强制触发升级
      console.log('[initDB] 重新打开数据库，强制创建对象存储');
      dbInstance = await openDB(DB_NAME, DB_VERSION, (db, oldVersion, newVersion) => {
        console.log(`[initDB] 强制升级: ${oldVersion} -> ${newVersion}`);
        
        // 确保创建链接对象存储
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          console.log(`[initDB] 创建对象存储: ${STORE_NAME}`);
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('url', 'url', { unique: true });
          store.createIndex('timestamp', 'timestamp');
        }
        // 确保创建分组对象存储
        if (!db.objectStoreNames.contains(GROUPS_STORE_NAME)) {
          console.log(`[initDB] 创建对象存储: ${GROUPS_STORE_NAME}`);
          db.createObjectStore(GROUPS_STORE_NAME, { keyPath: 'groupId' });
        }
        
        
        // 确保创建设置对象存储
        if (!db.objectStoreNames.contains('settings')) {
          console.log('[initDB] 创建对象存储: settings');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        console.log(`[initDB] 强制升级完成，当前对象存储: ${Array.from(db.objectStoreNames).join(', ')}`);
      });
      
      console.log('[initDB] 数据库重建成功，版本:', dbInstance.version);
      console.log('[initDB] 对象存储:', Array.from(dbInstance.objectStoreNames).join(', '));
    }
    
    return dbInstance;
  } catch (error) {
    console.error('[initDB] 数据库初始化失败:', error);
    dbInstance = null;
    throw error;
  }
}

/**
 * 加载所有分组
 * @returns {Promise<Array>} 分组数组
 */
export async function loadGroups() {
  try {
    const db = await initDB();
    if (!db.objectStoreNames.contains(GROUPS_STORE_NAME)) {
      console.warn('groups对象存储不存在，返回空数组');
      return [];
    }
    const store = getStore(db, GROUPS_STORE_NAME, 'readonly');
    return await getAll(store);
  } catch (error) {
    console.warn('loadGroups失败:', error);
    return [];
  }
}

/**
 * 导出所有分组
 * @returns {Promise<Array>} 分组数组
 */
export async function exportGroups() {
  return await loadGroups();
}

/**
 * 批量导入分组
 * @param {Array<Object>} groups 分组数组
 * @returns {Promise<{imported: number, skipped: number}>} 导入结果
 */
export async function importGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    return { imported: 0, skipped: 0 };
  }

  let imported = 0;
  let skipped = 0;

  for (const group of groups) {
    try {
      // 验证必要字段
      if (!group.groupId || !group.groupName) {
        skipped++;
        continue;
      }

      // 检查是否已存在
      const existing = await get(await initDB().then(db => getStore(db, GROUPS_STORE_NAME, 'readonly')), group.groupId);

      if (existing) {
        // 更新现有分组
        await updateGroup(group.groupId, {
          groupName: group.groupName,
          order: group.order,
          linkIds: group.linkIds || []
        });
      } else {
        // 添加新分组
        await addGroup({
          groupId: group.groupId,
          groupName: group.groupName,
          order: group.order || 0,
          linkIds: group.linkIds || []
        });
      }
      imported++;
    } catch (error) {
      console.error('导入分组失败:', error);
      skipped++;
    }
  }

  return { imported, skipped };
}

/**
 * 新增分组
 * @param {Object} group 分组对象，需包含 groupId, groupName, order, urls
 * @returns {Promise<void>}
 */
export async function addGroup(group) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');
  await add(store, group);
}

/**
 * 更新分组
 * @param {string} groupId 分组ID
 * @param {Object} updates 更新内容
 * @returns {Promise<void>}
 */
export async function updateGroup(groupId, updates) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');
  const group = await get(store, groupId);
  if (!group) throw new Error('分组不存在');
  const newGroup = { ...group, ...updates };
  await put(store, newGroup);
}

/**
 * 批量更新分组顺序
 * @param {Array<{groupId: string, order: number}>} orders 新的顺序数组
 * @returns {Promise<void>}
 */
export async function reorderGroups(orders) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');
  const groups = await getAll(store);

  for (const { groupId, order } of orders) {
    const group = groups.find(g => g.groupId === groupId);
    if (group) {
      group.order = order;
      await put(store, group);
    }
  }
}

/**
 * 批量更新组内链接顺序
 * @param {string} groupId 分组ID
 * @param {Array<number>} linkIds 新的链接ID顺序数组
 * @returns {Promise<void>}
 */
export async function reorderGroupLinks(groupId, linkIds) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');
  const group = await get(store, groupId);

  if (!group) throw new Error('分组不存在');
  group.linkIds = linkIds;
  await put(store, group);
}

/**
 * 删除分组
 * @param {string} groupId 分组ID
 * @returns {Promise<void>}
 */
export async function deleteGroup(groupId) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');
  await del(store, groupId);
}

// ==================== 分组引用关联方法 ====================

/**
 * 添加链接到分组（引用关联）
 * @param {string} groupId 分组ID
 * @param {number} linkId 主收藏夹链接的ID
 * @returns {Promise<void>}
 */
export async function addLinkToGroup(groupId, linkId) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');

  const group = await get(store, groupId);
  if (!group) throw new Error('分组不存在');

  // 初始化 linkIds 数组
  if (!group.linkIds) {
    group.linkIds = [];
  }

  // 避免重复添加
  if (!group.linkIds.includes(linkId)) {
    group.linkIds.push(linkId);
    await put(store, group);
  }
}

/**
 * 从分组移除链接
 * @param {string} groupId 分组ID
 * @param {number} linkId 主收藏夹链接的ID
 * @param {boolean} deleteSource 是否同时删除主收藏夹链接（默认 false，仅移除引用）
 * @returns {Promise<void>}
 */
export async function removeLinkFromGroup(groupId, linkId, deleteSource = false) {
  const db = await initDB();
  const store = getStore(db, GROUPS_STORE_NAME, 'readwrite');

  const group = await get(store, groupId);
  if (!group) throw new Error('分组不存在');

  if (group.linkIds) {
    group.linkIds = group.linkIds.filter(id => id !== linkId);
    await put(store, group);
  }

  // 如果 deleteSource 为 true，同时删除主收藏夹链接
  if (deleteSource) {
    await deleteLink(linkId);
  }
}

/**
 * 获取分组内所有链接的详情（关联查询）
 * @param {string} groupId 分组ID
 * @returns {Promise<Array>} 链接详情数组
 */
export async function getGroupLinks(groupId) {
  const db = await initDB();

  // 获取分组
  const groupsStore = getStore(db, GROUPS_STORE_NAME, 'readonly');
  const group = await get(groupsStore, groupId);

  if (!group || !group.linkIds || group.linkIds.length === 0) {
    return [];
  }

  // 获取所有链接详情
  const linksStore = getStore(db, STORE_NAME, 'readonly');
  const allLinks = await getAll(linksStore);

  // 过滤出组内引用的链接，并保持 linkIds 的顺序
  const groupLinks = [];
  for (const linkId of group.linkIds) {
    const link = allLinks.find(l => l.id === linkId);
    if (link) {
      groupLinks.push({
        id: link.id,
        title: link.title,
        url: link.url,
        tags: parseTags(link.tags),
        timestamp: link.timestamp,
        pinned: link.pinned || false
      });
    }
    // 如果链接已被删除，引用仍然保留（可选：清理无效引用）
  }

  return groupLinks;
}

/**
 * 更新分组内链接（同步到主收藏夹）
 * @param {string} groupId 分组ID
 * @param {number} linkId 主收藏夹链接的ID
 * @param {Object} updates 要更新的字段 {title, url, tags}
 * @returns {Promise<void>}
 */
export async function updateGroupLink(groupId, linkId, updates) {
  const db = await initDB();

  // 验证分组是否存在该引用
  const groupsStore = getStore(db, GROUPS_STORE_NAME, 'readonly');
  const group = await get(groupsStore, groupId);

  if (!group) throw new Error('分组不存在');
  if (!group.linkIds || !group.linkIds.includes(linkId)) {
    throw new Error('分组中不存在该链接');
  }

  // 更新主收藏夹中的链接
  await updateLink(linkId, updates);
}

/**
 * 清理分组中已失效的链接引用
 * （当主收藏夹链接被删除时调用）
 * @param {number} deletedLinkId 已删除的链接ID
 * @returns {Promise<void>}
 */
export async function cleanGroupLinkRefs(deletedLinkId) {
  const groups = await loadGroups();

  for (const group of groups) {
    if (group.linkIds && group.linkIds.includes(deletedLinkId)) {
      await removeLinkFromGroup(group.groupId, deletedLinkId);
    }
  }
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
export async function loadLinks(includeArchived = false) {
  console.log('[loadLinks] 开始加载链接, includeArchived:', includeArchived);
  try {
    console.log('[loadLinks] 初始化数据库...');
    const db = await initDB();
    if (!db || db.objectStoreNames.length === 0) {
      console.error('[loadLinks] 数据库连接无效');
      throw new Error('数据库连接无效');
    }
    console.log('[loadLinks] 数据库连接成功');

    // 首次加载时尝试迁移
    console.log('[loadLinks] 检查是否需要迁移数据...');
    await migrateFromChromeStorage();
    console.log('[loadLinks] 迁移检查完成');

    console.log('[loadLinks] 获取对象存储...');
    const store = getStore(db, STORE_NAME, 'readonly');
    console.log('[loadLinks] 从数据库读取所有链接...');
    const links = await getAll(store);
    console.log(`[loadLinks] 从数据库读取到 ${links.length} 条原始数据`);

    // 验证和清理数据
    const validLinks = [];
    for (const link of links) {
      if (!link || typeof link !== 'object' || !link.url || typeof link.url !== 'string' || !link.url.trim()) {
        continue;
      }

      // 过滤已归档的链接
      if (!includeArchived && link.archived) {
        continue;
      }

      validLinks.push({
        id: link.id,
        title: (link.title || '').trim(),
        url: link.url.trim(),
        tags: parseTags(link.tags), // 导出时转换为数组格式
        timestamp: link.timestamp || new Date().toISOString(),
        pinned: link.pinned || false,
        archived: link.archived || false,
        archivedAt: link.archivedAt || null
      });
    }

    console.log(`[loadLinks] 验证后有效链接: ${validLinks.length} 条`);

    // 排序：置顶的在前，然后按时间戳倒序排序
    const sortedLinks = validLinks.sort((a, b) => {
      const aPinned = a.pinned || false;
      const bPinned = b.pinned || false;
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    console.log('[loadLinks] 加载完成，返回', sortedLinks.length, '条链接');
    return sortedLinks;
  } catch (error) {
    console.error('[loadLinks] 加载链接失败:', error.name, error.message, error.stack);
    return [];
  }
}

/**
 * 加载已归档的链接
 * @returns {Promise<Array>} 已归档的链接数组
 */
export async function loadArchivedLinks() {
  console.log('[loadArchivedLinks] 开始加载已归档链接');
  try {
    const db = await initDB();
    if (!db || db.objectStoreNames.length === 0) {
      console.error('[loadArchivedLinks] 数据库连接无效');
      return [];
    }

    const store = getStore(db, STORE_NAME, 'readonly');
    const links = await getAll(store);
    console.log('[loadArchivedLinks] 从数据库获取到', links.length, '条原始链接');

    // 只返回已归档的链接
    const archivedLinks = [];
    for (const link of links) {
      if (!link || typeof link !== 'object' || !link.url) {
        continue;
      }
      console.log('[loadArchivedLinks] 检查链接:', link.id, 'archived:', link.archived, '类型:', typeof link.archived);
      if (link.archived === true) {  // 使用严格等于检查
        archivedLinks.push({
          id: link.id,
          title: (link.title || '').trim(),
          url: link.url.trim(),
          tags: parseTags(link.tags),
          timestamp: link.timestamp || new Date().toISOString(),
          pinned: link.pinned || false,
          archived: true,
          archivedAt: link.archivedAt || null
        });
      }
    }

    // 按归档时间逆序排序
    archivedLinks.sort((a, b) => {
      const timeA = new Date(a.archivedAt || 0).getTime();
      const timeB = new Date(b.archivedAt || 0).getTime();
      return timeB - timeA;
    });

    console.log('[loadArchivedLinks] 加载完成，返回', archivedLinks.length, '条已归档链接');
    return archivedLinks;
  } catch (error) {
    console.error('[loadArchivedLinks] 加载已归档链接失败:', error);
    return [];
  }
}

/**
 * 归档链接
 * @param {number} linkId - 链接ID
 * @returns {Promise<void>}
 */
export async function archiveLink(linkId) {
  console.log('[archiveLink] 归档链接:', linkId);
  const db = await initDB();
  const store = getStore(db, STORE_NAME, 'readwrite');
  const link = await get(store, linkId);
  if (!link) {
    throw new Error('链接不存在');
  }
  link.archived = true;
  link.archivedAt = new Date().toISOString();
  await put(store, link);
  console.log('[archiveLink] 归档成功');
}

/**
 * 取消归档
 * @param {number} linkId - 链接ID
 * @returns {Promise<void>}
 */
export async function unarchiveLink(linkId) {
  console.log('[unarchiveLink] 取消归档:', linkId);
  const db = await initDB();
  const store = getStore(db, STORE_NAME, 'readwrite');
  const link = await get(store, linkId);
  if (!link) {
    throw new Error('链接不存在');
  }
  link.archived = false;
  link.archivedAt = null;
  await put(store, link);
  console.log('[unarchiveLink] 取消归档成功');
}

/**
 * 添加链接
 * @param {Object} link - 链接对象 {title, url, tags, timestamp}
 * @returns {Promise<number>} 新添加的链接 ID
 */
export async function addLink(link) {
  console.log('[addLink] 开始添加链接:', link.url?.substring(0, 50));
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readwrite');
    
    const linkData = {
      title: link.title || '',
      url: link.url || '',
      tags: tagsArrayToString(link.tags), // 存储时转换为字符串格式
      timestamp: link.timestamp || new Date().toISOString()
    };
    
    console.log('[addLink] 准备添加数据:', linkData);
    const id = await add(store, linkData);
    console.log('[addLink] 添加成功，ID:', id);
    return id;
  } catch (error) {
    if (error.name === 'ConstraintError') {
      console.warn('[addLink] URL 已存在:', link.url);
      throw new Error('该 URL 已存在');
    }
    console.error('[addLink] 添加链接失败:', error.name, error.message);
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
    // 清理分组中的该链接引用
    await cleanGroupLinkRefs(id);
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
    
    // 合并更新，如果 updates 中有 tags，需要转换为字符串格式
    const processedUpdates = { ...updates };
    if ('tags' in processedUpdates) {
      processedUpdates.tags = tagsArrayToString(processedUpdates.tags);
    }
    const updated = { ...existing, ...processedUpdates, id };
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
  console.log('[getLinkByUrl] 查找 URL:', url?.substring(0, 50));
  try {
    const db = await initDB();
    const store = getStore(db, STORE_NAME, 'readonly');
    const index = store.index('url');
    
    return new Promise((resolve) => {
      const request = index.get(url);
      request.onsuccess = () => {
        const result = request.result || null;
        if (result) {
          console.log('[getLinkByUrl] 找到重复 URL');
        } else {
          console.log('[getLinkByUrl] URL 不存在');
        }
        resolve(result);
      };
      request.onerror = () => {
        console.error('[getLinkByUrl] 查询失败:', request.error);
        resolve(null);
      };
    });
  } catch (error) {
    console.error('[getLinkByUrl] 查找链接失败:', error);
    return null;
  }
}

/**
 * 批量添加链接（用于导入收藏夹等场景）
 * @param {Array<Object>} links - 链接数组
 * @returns {Promise<Object>} 结果 {imported: number, skipped: number}
 */
export async function batchAddLinks(links) {
  console.log('[batchAddLinks] 开始批量导入，数据条数:', links.length);
  if (!Array.isArray(links) || links.length === 0) {
    console.log('[batchAddLinks] 数据为空，返回');
    return { imported: 0, skipped: 0 };
  }
  
  try {
    console.log('[batchAddLinks] 初始化数据库...');
    const db = await initDB();
    if (!db || !db.objectStoreNames.contains(STORE_NAME)) {
      console.error('[batchAddLinks] 数据库连接无效');
      throw new Error('数据库连接无效');
    }
    console.log('[batchAddLinks] 数据库连接成功');
    
    let imported = 0;
    let skipped = 0;
    
    console.log(`[batchAddLinks] 开始循环处理 ${links.length} 条数据...`);
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      
      // 每处理 50 条输出一次进度
      if (i > 0 && i % 50 === 0) {
        console.log(`[batchAddLinks] 进度: ${i}/${links.length}, 成功: ${imported}, 跳过: ${skipped}`);
      }
      
      try {
        if (!link || typeof link !== 'object') {
          console.warn(`[batchAddLinks] 第 ${i + 1} 条数据无效: 不是对象`);
          skipped++;
          continue;
        }
        
        // 规范化 URL
        let url = (link.url || '').trim();
        if (!url) {
          console.warn(`[batchAddLinks] 第 ${i + 1} 条数据无效: URL 为空`);
          skipped++;
          continue;
        }
        
        // 验证 URL 格式
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
          if (i < 5) {
            console.log(`[batchAddLinks] 第 ${i + 1} 条 URL 已修正: ${url.substring(0, 50)}`);
          }
        }
        
        const linkData = {
          title: (link.title || '').trim() || '无标题',
          url: url,
          tags: tagsArrayToString(link.tags), // 兼容数组和字符串格式（包括中文逗号）
          timestamp: link.timestamp || new Date().toISOString()
        };

        // 调试日志
        if (i < 3) {
          console.log(`[batchAddLinks] 第 ${i + 1} 条原始timestamp:`, link.timestamp, '-> 保存的timestamp:', linkData.timestamp);
        }
        
        try {
          if (i < 3) {
            console.log(`[batchAddLinks] 第 ${i + 1} 条，准备获取对象存储...`);
          }
          const store = getStore(db, STORE_NAME, 'readwrite');
          if (i < 3) {
            console.log(`[batchAddLinks] 第 ${i + 1} 条，准备添加数据...`);
          }
          const id = await add(store, linkData);
          imported++;
          if (i < 3 || (i + 1) % 100 === 0) {
            console.log(`[batchAddLinks] 第 ${i + 1} 条添加成功，ID: ${id}`);
          }
        } catch (error) {
          if (error.name === 'ConstraintError' || error.message?.includes('已存在')) {
            if (i < 5) {
              console.warn(`[batchAddLinks] 第 ${i + 1} 条 URL 重复，跳过: ${url.substring(0, 50)}`);
            }
            skipped++;
          } else {
            console.error(`[batchAddLinks] 第 ${i + 1} 条添加失败:`, error.name, error.message, error.stack);
            skipped++;
          }
        }
      } catch (error) {
        console.error(`[batchAddLinks] 第 ${i + 1} 条处理失败:`, error.name, error.message);
        skipped++;
      }
    }
    
    console.log(`[batchAddLinks] 批量导入完成: 成功 ${imported} 条，跳过 ${skipped} 条`);
    return { imported, skipped };
  } catch (error) {
    console.error('[batchAddLinks] 批量导入失败:', error.name, error.message, error.stack);
    throw new Error(`批量导入失败: ${error.message || '未知错误'}`);
  }
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

/**
 * 删除整个数据库（清除所有数据）
 * @returns {Promise<void>}
 */
export async function clearDatabase() {
  console.log('[clearDatabase] 开始删除数据库');
  try {
    // 先关闭现有连接
    if (dbInstance) {
      console.log('[clearDatabase] 关闭现有数据库连接');
      try {
        dbInstance.close();
      } catch (e) {
        console.warn('[clearDatabase] 关闭连接时出错:', e);
      }
      dbInstance = null;
    }
    
    // 等待一小段时间，确保连接已关闭
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 删除数据库
    console.log('[clearDatabase] 删除数据库:', DB_NAME);
    await deleteDB(DB_NAME);
    console.log('[clearDatabase] 数据库删除成功');
  } catch (error) {
    console.error('[clearDatabase] 删除数据库失败:', error);
    throw error;
  }
}

