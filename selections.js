/**
 * 选中文本页面逻辑
 */
import { getAllSelections, deleteSelections, deleteSelectionByIndex } from './js/storage.js';
import { loadSettings } from './js/settings.js';

const container = document.getElementById('container');
const statusMessage = document.getElementById('statusMessage');
const backBtn = document.getElementById('backBtn');
const homeBtn = document.getElementById('homeBtn');
const refreshBtn = document.getElementById('refreshBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// 当前状态
let currentUrl = null;
let allSelections = [];
// 全局存储：用于保存每个selection-item的HTML数据
const selectionHtmlStore = new Map();

// 初始化
async function init() {
  // 检查 URL 参数
  const urlParams = new URLSearchParams(window.location.search);
  currentUrl = urlParams.get('url');
  // 加载设置并应用紧凑模式
  try {
    const settings = await loadSettings();
    if (settings && settings.compactMode && settings.compactMode.enabled) {
      document.body.classList.add('compact-mode');
    }
  } catch (e) {
    console.warn('加载设置失败，使用默认样式');
  }

  if (currentUrl) {
    // 选中文本详情视图
    showSelectionDetailView();
    await loadSelectionsForUrl();
  } else {
    // URL 列表视图
    showUrlListView();
    await loadUrlList();
  }
}

// 显示 URL 列表视图
function showUrlListView() {
  document.querySelector('h1').textContent = '选中文本';
  backBtn.style.display = 'none';
  homeBtn.style.display = 'block';
  refreshBtn.style.display = 'inline-block';
  clearAllBtn.style.display = 'inline-block';
}

// 显示选中文本详情视图
function showSelectionDetailView() {
  backBtn.style.display = 'inline-block';
  homeBtn.style.display = 'none';
  refreshBtn.style.display = 'inline-block';
  clearAllBtn.style.display = 'none';
  // 标题在 loadSelectionsForUrl 中根据 URL 设置
}

// 显示状态消息
function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.style.display = 'block';
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 2000);
}

// 自定义确认弹窗（返回 Promise<boolean>）
function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    const msg = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');
    if (!overlay || !msg || !okBtn || !cancelBtn) {
      // 回退到原生 confirm
      resolve(window.confirm(message));
      return;
    }

    msg.textContent = message;
    overlay.style.display = 'flex';

    function cleanup() {
      overlay.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
    }

    function onOk(e) {
      e.stopPropagation();
      cleanup();
      resolve(true);
    }

    function onCancel(e) {
      e.stopPropagation();
      cleanup();
      resolve(false);
    }

    function onOverlayClick(e) {
      if (e.target === overlay) {
        // 点击蒙层等同取消
        onCancel(e);
      }
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  });
}

// 加载 URL 列表
async function loadUrlList() {
  try {
    const selections = await getAllSelections();
    allSelections = selections || [];
    // 清空HTML存储，准备加载新数据
    selectionHtmlStore.clear();
    renderUrlList(allSelections);
  } catch (error) {
    console.error('加载失败:', error);
    showStatus('加载失败: ' + error.message);
  }
}

// 渲染 URL 列表
function renderUrlList(selections) {
  if (!selections || selections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无保存的选中文本</p>
        <p>在网页上选中文字后，右键选择"保存文本到读享"</p>
        <p>或使用快捷键 Shift+Alt+C</p>
      </div>
    `;
    return;
  }

  // 按更新时间（每页中最新的一条）排序，最新的页面在前
  const sortedSelections = [...selections].sort((a, b) => {
    const aTime = a.selections && a.selections.length > 0 ? new Date(a.selections[a.selections.length - 1].time) : new Date(0);
    const bTime = b.selections && b.selections.length > 0 ? new Date(b.selections[b.selections.length - 1].time) : new Date(0);
    return bTime - aTime;
  });

  // 为每个 URL 渲染一张卡片，并在其下展示全部选中文本预览（按时间倒序）
  container.innerHTML = sortedSelections.map(page => {
    const previews = (page.selections || []).slice().sort((a, b) => new Date(b.time) - new Date(a.time)).map((sel, selIdx) => {
      const contextTag = sel.contextTag || '';
      const tagDisplay = contextTag ? `<span class="selection-tag">&lt;${contextTag}&gt;</span>` : '';
      
      // 生成唯一ID用于存储HTML
      const itemId = `${page.url}_${selIdx}_${sel.time}`;
      if (sel.html) {
        selectionHtmlStore.set(itemId, sel.html);
      }
      
      // 根据HTML信息生成格式化的显示文本
      let displayText = sel.text;
      if (sel.html && sel.html.trim()) {
        displayText = htmlToFormattedText(sel.html);
      }
      
      return `
      <div class="selection-item" data-url="${escapeHtml(page.url)}" data-time="${escapeHtml(sel.time)}" data-item-id="${escapeHtml(itemId)}">
        ${tagDisplay ? `<div class="selection-header">${tagDisplay}</div>` : ''}
        <div class="selection-text">${escapeHtml(displayText)}</div>
        <div class="selection-meta">
          <span class="selection-time">${formatDate(sel.time)}</span>
          <div class="selection-actions">
            <button class="selection-action-btn copy" data-action="copy">复制</button>
            <button class="selection-action-btn delete" data-action="delete">删除</button>
          </div>
        </div>
      </div>
    `;
    }).join('');

    return `
      <div class="url-card" data-url="${escapeHtml(page.url)}">
        <div class="url-header">
          <span class="url-title">${escapeHtml(page.url)}</span>
          <span class="url-count">${page.count} 条记录</span>
        </div>
        <div class="url-actions">
          <button class="action-btn open-all" data-action="open" title="查看">▶</button>
          <button class="action-btn delete" data-action="delete" title="删除">✕</button>
        </div>
      </div>
      <div class="selection-preview" data-url="${escapeHtml(page.url)}">
        ${previews}
      </div>
    `;
  }).join('');

  // 绑定事件：保持卡片点击导航（但如果点击在预览上则忽略）
  container.querySelectorAll('.url-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 如果点击来自卡片内的按钮或来自预览（后面的 .selection-item），不要导航
      if (e.target.closest('.action-btn') || e.target.closest('.selection-item')) return;
      const url = card.dataset.url;
      navigateToUrl(url);
    });
  });

  // 打开详情
  container.querySelectorAll('.action-btn.open-all').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = e.target.closest('.url-card').dataset.url;
      navigateToUrl(url);
    });
  });

  // 删除整页记录
  container.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = e.target.closest('.url-card').dataset.url;
      confirmDeleteUrl(url);
    });
  });

  // 复制单条预览 - 复制格式化后的文本
  container.querySelectorAll('.selection-action-btn.copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.selection-item');
      const displayedText = item.querySelector('.selection-text').textContent || '';
      
      console.log('[renderUrlList] 复制格式化文本，长度:', displayedText.length);

      navigator.clipboard.writeText(displayedText).then(() => showStatus('已复制到剪贴板')).catch(err => showStatus('复制失败: ' + err.message));
    });
  });

  // 删除单条预览：需要根据时间+文本在存储中的原始数组中找到索引
  container.querySelectorAll('.selection-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = e.target.closest('.selection-item');
      const url = item.dataset.url;
      const time = item.dataset.time;
      const text = item.querySelector('.selection-text').textContent || '';

      if (!(await showConfirm('确定要删除这条选中文本吗？'))) return;

      try {
        // 在 allSelections 中找到页面记录以获取原始数组
        const page = allSelections.find(p => p.url === url);
        let origIndex = -1;
        if (page && page.selections) {
          origIndex = page.selections.findIndex(s => s.time === time && (s.text === text || s.text === text.trim()));
        }
        if (origIndex === -1) {
          // 兜底策略：尝试按时间查找最新匹配的索引
          const fallbackPage = (await getAllSelections()).find(p => p.url === url);
          if (fallbackPage && fallbackPage.selections) {
            origIndex = fallbackPage.selections.findIndex(s => s.time === time);
          }
        }

        if (origIndex === -1) {
          showStatus('删除失败：未找到对应记录');
          return;
        }

        await deleteSelectionByIndex(url, origIndex);
        showStatus('已删除');
        await loadUrlList();
      } catch (err) {
        console.error('删除失败:', err);
        showStatus('删除失败: ' + (err.message || err));
      }
    });
  });
}

// 导航到 URL
function navigateToUrl(url) {
  window.location.href = `selections.html?url=${encodeURIComponent(url)}`;
}

// 加载特定 URL 的选中文本
async function loadSelectionsForUrl() {
  try {
    const selections = await getAllSelections();
    const page = selections.find(s => s.url === currentUrl);

    if (page) {
      document.querySelector('h1').textContent = truncateUrl(page.url);
      renderSelections(page);
    } else {
      showStatus('未找到该页面的选中文本');
      window.location.href = 'selections.html';
    }
  } catch (error) {
    console.error('加载失败:', error);
    showStatus('加载失败: ' + error.message);
  }
}

// 渲染选中文本列表
function renderSelections(page) {
  if (!page.selections || page.selections.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>该页面暂无选中文本</p>
      </div>
    `;
    return;
  }

  // 清空之前的存储
  selectionHtmlStore.clear();

  // 按时间排序，最新的在前
  const sortedSelections = [...page.selections].sort((a, b) => {
    return new Date(b.time) - new Date(a.time);
  });

  container.innerHTML = `
    <div class="selection-page-info">
      <div class="selection-page-url">${escapeHtml(page.url)}</div>
    </div>
  ` + sortedSelections.map((sel, idx) => {
    // 构建标签信息
    const contextTag = sel.contextTag || '';
    const tagDisplay = contextTag ? `<span class="selection-tag">&lt;${contextTag}&gt;</span>` : '';
    
    // 生成唯一ID用于存储HTML
    const itemId = `${page.url}_${idx}_${sel.time}`;
    if (sel.html) {
      selectionHtmlStore.set(itemId, sel.html);
    }
    
    // 根据HTML信息生成格式化的显示文本
    let displayText = sel.text;
    if (sel.html && sel.html.trim()) {
      displayText = htmlToFormattedText(sel.html);
    }
    
    return `
    <div class="selection-item" data-url="${escapeHtml(page.url)}" data-index="${idx}" data-item-id="${escapeHtml(itemId)}">
      <div class="selection-header">
        ${tagDisplay}
        <span class="selection-time">${formatDate(sel.time)}</span>
      </div>
      <div class="selection-text">${escapeHtml(displayText)}</div>
      ${sel.html ? `
      <details class="selection-html-details">
        <summary>查看原文构成</summary>
        <div class="selection-html-content">${sel.html}</div>
      </details>
      ` : ''}
      <div class="selection-meta">
        <div class="selection-actions">
          <button class="selection-action-btn copy" data-action="copy">复制</button>
          <button class="selection-action-btn delete" data-action="delete">删除</button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  // 绑定复制按钮事件 - 复制格式化后的文本
  container.querySelectorAll('.selection-action-btn.copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const item = e.target.closest('.selection-item');
      const displayedText = item.querySelector('.selection-text').textContent || '';
      
      console.log('[renderSelections] 复制格式化文本，长度:', displayedText.length);

      navigator.clipboard.writeText(displayedText).then(() => {
        showStatus('已复制到剪贴板');
      }).catch(err => {
        showStatus('复制失败: ' + err.message);
      });
    });
  });

  // 绑定删除按钮事件
  container.querySelectorAll('.selection-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const item = e.target.closest('.selection-item');
      const url = item.dataset.url;
      const index = parseInt(item.dataset.index);
      if (await showConfirm('确定要删除这条选中文本吗？')) {
        await deleteSelectionByIndex(url, index);
        showStatus('已删除');
        await loadSelectionsForUrl();
      }
    });
  });
}

// 确认删除整个 URL 的选中文本
async function confirmDeleteUrl(url) {
  if (await showConfirm('确定要删除该页面的所有选中文本记录吗？')) {
    try {
      await deleteSelections(url);
      showStatus('已删除');
      await loadUrlList();
    } catch (err) {
      showStatus('删除失败: ' + err.message);
    }
  }
}

// 工具函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 将HTML转换为格式化的纯文本，处理块级元素的换行
 * @param {string} html - 原始HTML字符串
 * @returns {string} 格式化的纯文本
 */
function htmlToFormattedText(html) {
  if (!html || !html.trim()) {
    console.log('[htmlToFormattedText] HTML为空');
    return '';
  }

  try {
    console.log('[htmlToFormattedText] 开始处理HTML，长度:', html.length);
    
    // 创建一个临时容器来解析HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 块级元素定义
    const blockElements = new Set([
      'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'div', 'dl', 'dt',
      'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
      'br' // br也当作块级元素处理
    ]);

    /**
     * 提取纯文本，同时在块级元素边界处插入换行
     */
    function extractText(node, isFirstNode = true) {
      let text = '';

      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];

        if (child.nodeType === Node.TEXT_NODE) {
          // 文本节点：直接添加文本
          const content = child.textContent;
          if (content.trim()) {
            // 前面需要换行吗？（当前面有内容且不是换行结尾时）
            if (text && !text.endsWith('\n')) {
              // text += '\n';
            }
            text += content.trim();
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const tagName = child.tagName.toLowerCase();
          const isBlock = blockElements.has(tagName);

          // 块级元素前添加换行
          if (isBlock && text && !text.endsWith('\n')) {
            text += '\n';
          }

          // 递归处理子元素
          const childText = extractText(child, false);
          if (childText) {
            text += childText;
          }

          // 块级元素后添加换行
          if (isBlock && childText && !text.endsWith('\n')) {
            text += '\n';
          }
        }
      }

      return text;
    }

    let result = extractText(temp);

    // 后处理：清理多余换行和空白
    result = result
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    console.log('[htmlToFormattedText] 转换完成，行数:', result.split('\n').length, '总长度:', result.length);
    console.log('[htmlToFormattedText] 内容预览:', result.substring(0, 200));
    
    return result;
  } catch (error) {
    console.error('[htmlToFormattedText] 转换失败:', error);
    return '';
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function truncateUrl(url) {
  if (url.length > 30) {
    return url.substring(0, 30) + '...';
  }
  return url;
}

// 返回按钮
backBtn.addEventListener('click', () => {
  window.location.href = 'selections.html';
});

// 主页按钮
homeBtn.addEventListener('click', () => {
  if (window.parent !== window) {
    // 在 iframe 内：通知父页面关闭 overlay
    window.parent.postMessage('closeOverlay', '*');
  } else {
    // 独立窗口（快捷键打开）：跳转回主页
    window.location.href = 'popup.html';
  }
});

// 刷新按钮
refreshBtn.addEventListener('click', () => {
  if (currentUrl) {
    loadSelectionsForUrl();
  } else {
    loadUrlList();
  }
  showStatus('已刷新');
});

// 清空全部按钮
clearAllBtn.addEventListener('click', async () => {
  if (!(await showConfirm('确定要清空所有选中文本吗？此操作不可恢复！'))) {
    return;
  }
  if (!(await showConfirm('最后确认：真的要清空吗？'))) {
    return;
  }

  for (const page of allSelections) {
    await deleteSelections(page.url);
  }
  showStatus('已清空全部');
  await loadUrlList();
});

// ESC 关闭
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});

// 启动
init();
