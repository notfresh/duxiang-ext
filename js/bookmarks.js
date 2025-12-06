/**
 * 收藏夹导入模块
 * 负责从浏览器收藏夹读取并转换为阅读链接
 */

import { getLinkByUrl, addLink } from './storage.js';

/**
 * 获取书签的文件夹路径
 * @param {chrome.bookmarks.BookmarkTreeNode} bookmarkNode - 书签节点
 * @param {Map} bookmarkMap - 书签ID到节点的映射
 * @returns {string} 文件夹路径
 */
function getBookmarkPath(bookmarkNode, bookmarkMap) {
  const path = [];
  let current = bookmarkNode;
  
  // 向上遍历到根节点
  while (current && current.parentId && current.parentId !== '0') {
    const parent = bookmarkMap.get(current.parentId);
    if (parent && parent.title) {
      path.unshift(parent.title);
    }
    current = parent;
  }
  
  return path.join('/');
}

/**
 * 将书签转换为阅读链接格式
 * @param {chrome.bookmarks.BookmarkTreeNode} bookmark - 书签节点
 * @param {Map} bookmarkMap - 书签ID到节点的映射
 * @returns {Object|null} 链接对象或 null（如果不是有效的书签）
 */
export function convertBookmarkToLink(bookmark, bookmarkMap) {
  // 只处理有 URL 的书签（排除文件夹）
  if (!bookmark.url) {
    return null;
  }
  
  // 获取文件夹路径作为标签
  const folderPath = getBookmarkPath(bookmark, bookmarkMap);
  
  return {
    title: bookmark.title || bookmark.url,
    url: bookmark.url,
    tags: folderPath || '',
    timestamp: new Date().toISOString()
  };
}

/**
 * 检查 URL 是否已存在
 * @param {string} url - URL
 * @returns {Promise<boolean>} 是否存在
 */
async function checkDuplicate(url) {
  const existing = await getLinkByUrl(url);
  return existing !== null;
}

/**
 * 递归获取所有书签
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes - 书签节点数组
 * @param {Map} bookmarkMap - 书签ID到节点的映射（用于构建路径）
 * @returns {chrome.bookmarks.BookmarkTreeNode[]} 所有书签节点
 */
function getAllBookmarks(nodes, bookmarkMap) {
  const bookmarks = [];
  
  for (const node of nodes) {
    // 将节点添加到映射中
    bookmarkMap.set(node.id, node);
    
    // 如果有 URL，说明是书签（不是文件夹）
    if (node.url) {
      bookmarks.push(node);
    }
    
    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      bookmarks.push(...getAllBookmarks(node.children, bookmarkMap));
    }
  }
  
  return bookmarks;
}

/**
 * 导入收藏夹
 * @param {Function} onProgress - 进度回调函数 (imported, skipped, processed, total) => void
 * @returns {Promise<Object>} 导入结果 {imported: number, skipped: number, total: number}
 */
export async function importBookmarks(onProgress = null) {
  return new Promise((resolve, reject) => {
    // 获取所有书签树
    chrome.bookmarks.getTree((bookmarkTreeNodes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // 构建书签映射（用于快速查找父节点）
      const bookmarkMap = new Map();
      
      // 获取所有书签
      const allBookmarks = getAllBookmarks(bookmarkTreeNodes, bookmarkMap);
      
      if (allBookmarks.length === 0) {
        resolve({ imported: 0, skipped: 0, total: 0 });
        return;
      }
      
      // 异步导入所有书签
      (async () => {
        let imported = 0;
        let skipped = 0;
        const total = allBookmarks.length;
        
        for (let i = 0; i < allBookmarks.length; i++) {
          const bookmark = allBookmarks[i];
          
          try {
            // 转换为链接格式
            const link = convertBookmarkToLink(bookmark, bookmarkMap);
            
            if (!link) {
              skipped++;
              continue;
            }
            
            // 检查是否重复
            const isDuplicate = await checkDuplicate(link.url);
            
            if (isDuplicate) {
              skipped++;
            } else {
              // 添加到存储
              await addLink(link);
              imported++;
            }
            
            // 报告进度（processed 是已处理的条数）
            if (onProgress) {
              onProgress(imported, skipped, i + 1, total);
            }
          } catch (error) {
            console.error('导入书签失败:', error, bookmark);
            skipped++;
          }
        }
        
        resolve({ imported, skipped, total });
      })();
    });
  });
}

