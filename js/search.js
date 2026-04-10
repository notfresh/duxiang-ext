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
 * 解析搜索文本，将 tag:/title:/url: 片段与普通关键词分开
 * @param {string} searchText - 原始搜索文本
 * @returns {{ tagFilters: string[], titleFilters: string[], urlFilters: string[], keywords: string[] }}
 */
function parseSearchText(searchText) {
  const tagFilters = [];
  const titleFilters = [];
  const urlFilters = [];
  const keywords = [];

  for (const token of searchText.trim().split(/\s+/)) {
    if (!token) continue;
    const lower = token.toLowerCase();
    if (lower.startsWith('tag:')) {
      const val = token.slice(4);
      if (val) tagFilters.push(val.toLowerCase());
    } else if (lower.startsWith('title:')) {
      const val = token.slice(6);
      if (val) titleFilters.push(val.toLowerCase());
    } else if (lower.startsWith('url:')) {
      const val = token.slice(4);
      if (val) urlFilters.push(val.toLowerCase());
    } else {
      keywords.push(lower);
    }
  }

  return { tagFilters, titleFilters, urlFilters, keywords };
}

/**
 * 检查链接是否匹配所有过滤器和普通关键词
 * @param {Object} link - 链接对象
 * @param {string[]} tagFilters - tag: 提取出的标签关键词
 * @param {string[]} titleFilters - title: 提取出的标题关键词
 * @param {string[]} urlFilters - url: 提取出的 URL 关键词
 * @param {string[]} keywords - 普通关键词数组
 * @returns {boolean} 是否匹配
 */
function matchesLink(link, tagFilters, titleFilters, urlFilters, keywords) {
  const title = link.title || '';
  const url = link.url || '';
  const tags = parseTags(link.tags || '');

  // tag: 过滤：每个 tagFilter 都必须在标签列表里找到至少一个包含匹配
  const tagMatch = tagFilters.every(tf =>
    tags.some(t => t.toLowerCase().includes(tf))
  );

  // title: 过滤：每个 titleFilter 必须出现在标题里
  const titleMatch = titleFilters.every(tf =>
    matchesKeyword(title, tf)
  );

  // url: 过滤：每个 urlFilter 必须出现在 URL 里
  const urlMatch = urlFilters.every(uf =>
    matchesKeyword(url, uf)
  );

  // 普通关键词：在标题、URL、任意标签中全文匹配
  const keywordMatch = keywords.every(kw =>
    matchesKeyword(title, kw) ||
    matchesKeyword(url, kw) ||
    tags.some(t => matchesKeyword(t, kw))
  );

  return tagMatch && titleMatch && urlMatch && keywordMatch;
}

/**
 * 搜索链接
 * 支持 tag:XXX 语法专门匹配标签，其余词在标题、URL、标签中全文搜索
 * 多个词之间为 AND 关系，例如：tag:前端 react
 * @param {string} searchText - 搜索文本
 * @param {Array} links - 链接数组
 * @returns {Array} 匹配的链接数组
 */
export function searchLinks(searchText, links) {
  if (!searchText || searchText.trim() === '') {
    return links;
  }

  const { tagFilters, titleFilters, urlFilters, keywords } = parseSearchText(searchText);

  if (tagFilters.length === 0 && titleFilters.length === 0 && urlFilters.length === 0 && keywords.length === 0) {
    return links;
  }

  return links.filter(link => matchesLink(link, tagFilters, titleFilters, urlFilters, keywords));
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

