/**
 * 搜索模块
 * 提供链接搜索和过滤功能
 */

import { parseTags } from './utils.js';

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * 检查文本是否包含关键词（不区分大小写）
 * @param {string} text - 要搜索的文本
 * @param {string} keyword - 关键词
 * @returns {boolean} 是否匹配
 */
function matchesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * 检查链接是否匹配所有关键词
 * @param {Object} link - 链接对象
 * @param {string[]} keywords - 关键词数组
 * @returns {boolean} 是否匹配
 */
function matchesAllKeywords(link, keywords) {
  if (keywords.length === 0) return true;
  
  const title = link.title || '';
  const url = link.url || '';
  const tags = parseTags(link.tags || '');
  const tagsText = tags.join(' ');
  
  // 检查每个关键词是否在标题、URL 或标签中
  return keywords.every(keyword => {
    const keywordLower = keyword.toLowerCase();
    return matchesKeyword(title, keywordLower) || 
           matchesKeyword(url, keywordLower) ||
           tags.some(tag => matchesKeyword(tag, keywordLower)) ||
           matchesKeyword(tagsText, keywordLower);
  });
}

/**
 * 搜索链接
 * 支持在标题、URL 和标签中搜索
 * @param {string} searchText - 搜索文本
 * @param {Array} links - 链接数组
 * @returns {Array} 匹配的链接数组
 */
export function searchLinks(searchText, links) {
  // 如果搜索文本为空，返回所有链接
  if (!searchText || searchText.trim() === '') {
    return links;
  }
  
  // 将搜索文本按空格分割为关键词数组
  const keywords = searchText.trim().split(/\s+/).filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    return links;
  }
  
  // 过滤链接（匹配标题、URL 或标签）
  return links.filter(link => matchesAllKeywords(link, keywords));
}

/**
 * 设置搜索功能
 * @param {HTMLElement} searchInput - 搜索输入框
 * @param {HTMLElement} clearBtn - 清除按钮
 * @param {Function} onSearch - 搜索回调函数 (filteredLinks) => void
 * @param {Array} allLinks - 所有链接数组
 * @returns {Function} 更新搜索的函数（当链接列表更新时调用）
 */
export function setupSearch(searchInput, clearBtn, onSearch, allLinks) {
  let currentLinks = allLinks;
  
  // 更新搜索函数（当链接列表更新时调用）
  const updateSearch = (newLinks) => {
    currentLinks = newLinks;
    // 如果有搜索关键词，重新执行搜索
    const searchText = searchInput.value.trim();
    if (searchText) {
      const filtered = searchLinks(searchText, currentLinks);
      onSearch(filtered, searchText);
    }
  };
  
  // 执行搜索
  const performSearch = () => {
    const searchText = searchInput.value.trim();
    
    // 显示/隐藏清除按钮
    if (clearBtn) {
      clearBtn.style.display = searchText ? 'block' : 'none';
    }
    
    // 执行搜索
    const filtered = searchLinks(searchText, currentLinks);
    onSearch(filtered, searchText);
  };
  
  // 防抖搜索
  const debouncedSearch = debounce(performSearch, 300);
  
  // 绑定输入事件
  searchInput.addEventListener('input', debouncedSearch);
  
  // 清除按钮事件
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      performSearch(); // 立即执行，不需要防抖
    });
  }
  
  // 初始状态：隐藏清除按钮
  if (clearBtn) {
    clearBtn.style.display = 'none';
  }
  
  return updateSearch;
}

