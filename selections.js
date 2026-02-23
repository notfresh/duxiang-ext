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
    const previews = (page.selections || []).slice().sort((a, b) => new Date(b.time) - new Date(a.time)).map(sel => `
      <div class="selection-item" data-url="${escapeHtml(page.url)}" data-time="${escapeHtml(sel.time)}">
        <div class="selection-text">${escapeHtml(sel.text)}</div>
        <div class="selection-meta">
          <span class="selection-time">${formatDate(sel.time)}</span>
          <div class="selection-actions">
            <button class="selection-action-btn copy" data-action="copy">复制</button>
            <button class="selection-action-btn delete" data-action="delete">删除</button>
          </div>
        </div>
      </div>
    `).join('');

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

  // 复制单条预览
  container.querySelectorAll('.selection-action-btn.copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = e.target.closest('.selection-item');
      const url = item.dataset.url;
      const time = item.dataset.time;
      const text = item.querySelector('.selection-text').textContent || '';
      // 直接复制文本
      navigator.clipboard.writeText(text).then(() => showStatus('已复制到剪贴板')).catch(err => showStatus('复制失败: ' + err.message));
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

  // 按时间排序，最新的在前
  const sortedSelections = [...page.selections].sort((a, b) => {
    return new Date(b.time) - new Date(a.time);
  });

  container.innerHTML = `
    <div class="selection-page-info">
      <div class="selection-page-url">${escapeHtml(page.url)}</div>
    </div>
  ` + sortedSelections.map((sel, idx) => `
    <div class="selection-item" data-url="${escapeHtml(page.url)}" data-index="${idx}">
      <div class="selection-text">${escapeHtml(sel.text)}</div>
      <div class="selection-meta">
        <span class="selection-time">${formatDate(sel.time)}</span>
        <div class="selection-actions">
          <button class="selection-action-btn copy" data-action="copy">复制</button>
          <button class="selection-action-btn delete" data-action="delete">删除</button>
        </div>
      </div>
    </div>
  `).join('');

  // 绑定复制按钮事件
  container.querySelectorAll('.selection-action-btn.copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const text = e.target.closest('.selection-item').querySelector('.selection-text').textContent;
      navigator.clipboard.writeText(text).then(() => {
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
  window.location.href = 'popup.html';
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
