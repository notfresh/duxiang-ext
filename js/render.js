/**
 * 渲染模块
 * 负责链接列表的渲染和UI更新
 */

import { formatDate, parseTags } from './utils.js';

/**
 * 创建链接卡片元素
 * @param {Object} link - 链接对象
 * @param {number} index - 链接索引
 * @param {Function} onDelete - 删除回调函数
 * @param {Function} onEdit - 编辑回调函数
 * @param {Function} onPin - 置顶回调函数
 * @param {Function} onLog - 日志回调函数（可选，用于调试）
 * @returns {HTMLElement} 链接卡片元素
 */
export function createLinkCard(link, index, onDelete, onEdit, onPin, onLog = null) {
  const card = document.createElement('div');
  card.className = 'link-card';
  card.dataset.linkId = link.id;

  // 头部区域：标题和删除按钮
  const cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';
  
  // 标题（可点击）
  const title = document.createElement('a');
  title.className = 'link-title';
  title.href = link.url;
  title.textContent = link.title || '无标题';
  title.target = '_blank';
  title.title = link.title || '无标题'; // 悬停提示
  cardHeader.appendChild(title);
  
  // 按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'card-actions';
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '4px';
  
  // 置顶按钮
  const pinBtn = document.createElement('button');
  pinBtn.className = 'pin-btn';
  const isPinned = link.pinned || false;
  pinBtn.innerHTML = isPinned ? '📌' : '○'; // 已置顶显示图钉，未置顶显示空心圆
  pinBtn.title = isPinned ? '取消置顶' : '置顶';
  if (isPinned) {
    pinBtn.classList.add('pinned');
  }
  pinBtn.addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    onPin(link);
  });
  buttonContainer.appendChild(pinBtn);
  
  // 编辑按钮
  const editBtn = document.createElement('button');
  editBtn.className = 'edit-btn';
  editBtn.innerHTML = '✎'; // 编辑符号
  editBtn.title = '编辑链接';
  editBtn.addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    onEdit(link);
  });
  buttonContainer.appendChild(editBtn);
  
  // 删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = '&times;'; // × 符号
  deleteBtn.title = '删除链接';
  deleteBtn.addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    // 传递 link 对象而不是 index，这样在搜索过滤后也能正确删除
    onDelete(link);
  });
  buttonContainer.appendChild(deleteBtn);
  
  cardHeader.appendChild(buttonContainer);
  
  card.appendChild(cardHeader);
  
  // URL
  const url = document.createElement('div');
  url.className = 'link-url';
  const urlLink = document.createElement('a');
  urlLink.href = link.url;
  urlLink.textContent = link.url;
  urlLink.target = '_blank';
  url.appendChild(urlLink);
  card.appendChild(url);
  
  // 底部元信息
  const meta = document.createElement('div');
  meta.className = 'link-meta';
  
  // 标签
  const tags = document.createElement('div');
  tags.className = 'link-tags';
  const tagArray = parseTags(link.tags);
  tagArray.forEach(tag => {
    const tagSpan = document.createElement('span');
    tagSpan.textContent = tag;
    tags.appendChild(tagSpan);
  });
  meta.appendChild(tags);
  
  // 时间戳
  if (link.timestamp) {
    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = formatDate(link.timestamp);
    meta.appendChild(timestamp);
  }
  
  card.appendChild(meta);
  
  // 添加点击事件
  urlLink.addEventListener('click', function(event) {
    // 不阻止默认行为，让链接在新标签页打开
    // 但记录点击（如果启用调试）
    if (onLog) {
      onLog(`链接被点击: ${link.title}`);
    }
  });
  
  return card;
}

/**
 * 渲染链接列表
 * @param {HTMLElement} container - 容器元素
 * @param {Array} links - 链接数组
 * @param {Function} onDelete - 删除回调函数
 * @param {Function} onEdit - 编辑回调函数
 * @param {Function} onPin - 置顶回调函数
 * @param {Function} onLog - 日志回调函数（可选）
 */
export function renderLinks(container, links, onDelete, onEdit, onPin, onLog = null) {
  // 清空容器
  container.innerHTML = '';
  
  if (!Array.isArray(links) || links.length === 0) {
    showEmptyState(container);
    return;
  }
  
  // 渲染每个链接
  links.forEach((link, index) => {
    if (onLog) {
      onLog(`渲染第 ${index + 1} 条链接: ${link.title || '无标题'}`);
    }
    
    const linkCard = createLinkCard(link, index, onDelete, onEdit, onPin, onLog);
    container.appendChild(linkCard);
  });
}

/**
 * 追加渲染链接到容器（不清空容器）
 * @param {HTMLElement} container - 容器元素
 * @param {Array} links - 要追加的链接数组
 * @param {Function} onDelete - 删除回调函数
 * @param {Function} onEdit - 编辑回调函数
 * @param {Function} onPin - 置顶回调函数
 * @param {Function} onLog - 日志回调函数（可选）
 */
export function appendLinks(container, links, onDelete, onEdit, onPin, onLog = null) {
  if (!Array.isArray(links) || links.length === 0) return;

  links.forEach((link, index) => {
    if (onLog) {
      onLog(`追加渲染: ${link.title || '无标题'}`);
    }
    const linkCard = createLinkCard(link, index, onDelete, onEdit, onPin, onLog);
    container.appendChild(linkCard);
  });
}

/**
 * 显示空状态
 * @param {HTMLElement} container - 容器元素
 */
export function showEmptyState(container) {
  container.innerHTML = `
    <div class="empty-state">
      <p>暂无保存的阅读链接</p>
      <p>使用快捷键 Shift+Alt+S 添加当前页面到阅读列表</p>
    </div>
  `;
}

/**
 * 显示搜索空状态
 * @param {HTMLElement} container - 容器元素
 * @param {string} keyword - 搜索关键词
 */
export function showSearchEmptyState(container, keyword) {
  container.innerHTML = `
    <div class="empty-state">
      <p>未找到匹配的链接</p>
      <p>搜索关键词: "${keyword}"</p>
    </div>
  `;
}

