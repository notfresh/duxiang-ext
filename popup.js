// 导入模块
import { showStatus, log, tagsArrayToString, parseTags, formatDate } from './js/utils.js';
import { renderLinks, appendLinks, showEmptyState, showSearchEmptyState } from './js/render.js';
import { loadLinks, loadGroups, loadArchivedLinks, archiveLink, unarchiveLink, deleteLink as deleteLinkFromStorage, updateLink, exportLinks, batchAddLinks, togglePinLink, clearDatabase as clearDatabaseFromStorage, addLink, addLinkToGroup, removeLinkFromGroup, addGroup } from './js/storage.js';
import { importBookmarks } from './js/bookmarks.js';
import { setupSearch } from './js/search.js';
import { loadSettings, saveSettings, updateCompactModeSettings, generateUUIDv4 } from './js/settings.js';
import { loadHistory, addSearchKeyword, togglePinKeyword, deleteKeyword, getMaxCount, setMaxCount } from './js/searchHistory.js';

document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const linksContainer = document.getElementById('linksContainer');
  const addBtn = document.getElementById('addBtn');
  const importBookmarksBtn = document.getElementById('settingsImportBookmarksBtn');
  const jsonFileInput = document.getElementById('jsonFileInput');
  const exportBtn = document.getElementById('exportBtn');
  const settingsImportBtn = document.getElementById('settingsImportBtn');
  const settingsExportBtn = document.getElementById('settingsExportBtn');
  const clearDataBtn = document.getElementById('clearDataBtn');
  const debugBtn = document.getElementById('debugBtn');
  const statusMessage = document.getElementById('statusMessage');
  const debugPanel = document.getElementById('debugPanel');
  const shortcutTip = document.getElementById('shortcutTip');
  const configureShortcutBtn = document.getElementById('configureShortcutBtn');
  const dismissShortcutTipBtn = document.getElementById('dismissShortcutTipBtn');
  
  // 搜索相关元素
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  // 搜索历史相关元素
  const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
  
  // 编辑对话框元素
  const editDialogOverlay = document.getElementById('editDialogOverlay');
  const editDialogTitle = document.querySelector('#editDialogOverlay h2');
  const editTitleInput = document.getElementById('editTitleInput');
  const editUrlInput = document.getElementById('editUrlInput');
  const editTagsInput = document.getElementById('editTagsInput');
  const editCancelBtn = document.getElementById('editCancelBtn');
  const editSaveBtn = document.getElementById('editSaveBtn');

  // 分组选择相关元素
  const newGroupBtn = document.getElementById('newGroupBtn');
  const groupSelectContainer = document.getElementById('groupSelectContainer');
  const groupDialogOverlay = document.getElementById('groupDialogOverlay');
  const newGroupNameInput = document.getElementById('newGroupNameInput');
  const groupCancelBtn = document.getElementById('groupCancelBtn');
  const groupSaveBtn = document.getElementById('groupSaveBtn');

  // 当前选中的分组 ID 列表
  let selectedGroupIds = [];
  
  // 设置对话框元素
  const settingsBtn = document.getElementById('settingsBtn');
  const deviceIdInput = document.getElementById('deviceIdInput');
  const regenerateDeviceIdBtn = document.getElementById('regenerateDeviceIdBtn');
  const settingsDialogOverlay = document.getElementById('settingsDialogOverlay');
  const compactModeCheckbox = document.getElementById('compactModeCheckbox');
  const showUrlCheckbox = document.getElementById('showUrlCheckbox');
  const showDateCheckbox = document.getElementById('showDateCheckbox');
  const showTagsCheckbox = document.getElementById('showTagsCheckbox');
  const titleMaxCharsInput = document.getElementById('titleMaxCharsInput');
  const urlMaxCharsInput = document.getElementById('urlMaxCharsInput');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  const syncPeerUrlInput = document.getElementById('syncPeerUrlInput');
  const syncPullBtn = document.getElementById('syncPullBtn');
  const syncPushBtn = document.getElementById('syncPushBtn');
  const syncStatusText = document.getElementById('syncStatusText');
  const linkCountSpan = document.getElementById('linkCountSpan');
  const groupCountSpan = document.getElementById('groupCountSpan');
  const archivedCountSpan = document.getElementById('archivedCountSpan');
  const dataSizeSpan = document.getElementById('dataSizeSpan');
  const viewArchivedBtn = document.getElementById('viewArchivedBtn');
  const searchHistoryMaxCountInput = document.getElementById('searchHistoryMaxCountInput');
  const archivedView = document.getElementById('archivedView');
  const archivedContainer = document.getElementById('archivedContainer');
  const backFromArchivedBtn = document.getElementById('backFromArchivedBtn');

  // 状态管理
  let isDebugMode = false;
  let loadedLinks = [];
  let currentEditingLink = null; // 当前正在编辑的链接
  let updateSearchFn = null; // 搜索更新函数
  let currentSettings = null; // 当前设置

  let historyCache = [];        // 缓存的历史记录列表
  let hideDropdownTimeout = null; // 延迟隐藏定时器
  
  // 滚动加载相关状态
  const PAGE_SIZE = 30;          // 每次滚动加载条数
  let renderedCount = 0;         // 已渲染数量
  let isSearchActive = false;    // 是否处于搜索模式
  let scrollObserver = null;     // IntersectionObserver 实例
  const loadingProgress = document.getElementById('loadingProgress');

  // 置顶分组横条（点击跳转到分组管理页）
  const pinnedGroupsBar = document.getElementById('pinnedGroupsBar');
  const pinnedGroupLabel = document.getElementById('pinnedGroupLabel');
  const pinnedGroupList = document.getElementById('pinnedGroupList');
  
  // 包装工具函数，传入DOM元素
  const showStatusMessage = (message, isError = false) => {
    showStatus(statusMessage, message, isError);
  };
  
  const logMessage = (message) => {
    log(debugPanel, message);
  };
  
  // 切换调试模式
  function toggleDebugMode() {
    isDebugMode = !isDebugMode;
    debugPanel.style.display = isDebugMode ? 'block' : 'none';
    debugBtn.textContent = isDebugMode ? '隐藏调试' : '调试';
    
    if (isDebugMode) {
      debugPanel.textContent = '调试日志：';
      testStorage();
    }
  }
  
  // 测试存储功能
  async function testStorage() {
    logMessage('检查 IndexedDB 存储状态...');
    
    try {
      const links = await loadLinks();
      logMessage(`IndexedDB 中共有 ${links.length} 条链接`);
      
      if (links.length > 0) {
        logMessage(`- 第一条: ${JSON.stringify(links[0]).substring(0, 100)}...`);
      }
    } catch (error) {
      logMessage('存储访问错误: ' + error.message);
    }
  }
  
  // 更新加载进度显示
  function updateLoadingProgress(rendered, total) {
    if (!loadingProgress) return;
    if (rendered >= total) {
      loadingProgress.classList.remove('active');
    } else {
      loadingProgress.textContent = `已显示 ${rendered} / ${total} 条`;
      loadingProgress.classList.add('active');
    }
  }

  // 追加下一批链接到 DOM
  function appendNextBatch() {
    if (isSearchActive) return;
    const total = loadedLinks.length;
    if (renderedCount >= total) return;

    const batchEnd = Math.min(renderedCount + PAGE_SIZE, total);
    const batch = loadedLinks.slice(renderedCount, batchEnd);

    appendLinks(
      linksContainer,
      batch,
      handleDeleteLink,
      handleEditLink,
      handlePinLink,
      isDebugMode ? logMessage : null
    );

    addArchiveButtons();
    if (currentSettings) {
      const allCards = linksContainer.querySelectorAll('.link-card');
      for (let i = renderedCount; i < batchEnd && i < allCards.length; i++) {
        applyTextTruncation(allCards[i], currentSettings);
      }
    }

    renderedCount = batchEnd;
    updateLoadingProgress(renderedCount, total);

    if (renderedCount >= total) {
      destroyScrollObserver();
      showStatusMessage(`共 ${total} 条链接`);
    } else {
      // 把哨兵移到列表末尾，确保下次触底仍能触发
      const sentinel = document.getElementById('scrollSentinel');
      if (sentinel) linksContainer.appendChild(sentinel);
    }
  }

  // 创建底部哨兵元素并启动 IntersectionObserver
  function setupScrollObserver() {
    destroyScrollObserver();

    // 若已全部渲染，无需 Observer
    if (renderedCount >= loadedLinks.length) return;

    // 创建/复用哨兵元素
    let sentinel = document.getElementById('scrollSentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.id = 'scrollSentinel';
      sentinel.style.height = '1px';
    }
    linksContainer.appendChild(sentinel);

    scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        appendNextBatch();
        // 若还有更多，observer 会在下次哨兵可见时再触发
        if (renderedCount >= loadedLinks.length) {
          destroyScrollObserver();
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px 200px 0px' });

    scrollObserver.observe(sentinel);
  }

  // 销毁 IntersectionObserver 并移除哨兵
  function destroyScrollObserver() {
    if (scrollObserver) {
      scrollObserver.disconnect();
      scrollObserver = null;
    }
    const sentinel = document.getElementById('scrollSentinel');
    if (sentinel) sentinel.remove();
  }

  // 加载存储的链接
  async function loadLinksFromStorage() {
    console.log('[loadLinksFromStorage] 开始加载数据');
    logMessage('开始加载链接数据');

    // 销毁上一次的滚动观察器
    destroyScrollObserver();
    renderedCount = 0;
    isSearchActive = false;

    try {
      console.log('[loadLinksFromStorage] 调用 loadLinks()...');
      loadedLinks = await loadLinks();
      console.log('[loadLinksFromStorage] loadLinks() 返回，数据条数:', loadedLinks?.length);

      if (!Array.isArray(loadedLinks)) {
        console.error('[loadLinksFromStorage] loadedLinks 不是数组:', loadedLinks);
        loadedLinks = [];
      }

      if (isDebugMode) {
        logMessage(`获取到 ${loadedLinks.length} 条链接数据`);
      }

      if (loadedLinks.length === 0) {
        console.log('[loadLinksFromStorage] 没有数据，显示空状态');
        showEmptyState(linksContainer);
        showStatusMessage('没有保存的链接');
        return;
      }

      try {
        const total = loadedLinks.length;
        // 首屏：渲染前 PAGE_SIZE 条
        const initialBatch = loadedLinks.slice(0, PAGE_SIZE);
        console.log(`[loadLinksFromStorage] 首屏渲染 ${initialBatch.length} 条，共 ${total} 条`);

        renderLinksList(initialBatch);
        renderedCount = initialBatch.length;

        // 搜索始终基于全量数据
        if (!updateSearchFn) {
          console.log('[loadLinksFromStorage] 初始化搜索功能');
          updateSearchFn = setupSearch(
            searchInput,
            clearSearchBtn,
            handleSearchResults,
            loadedLinks
          );
        } else {
          console.log('[loadLinksFromStorage] 更新搜索数据源');
          updateSearchFn(loadedLinks);
          refreshHistoryCache();
        }

        // 搜索框 focus：当输入为空时显示历史下拉列表
        searchInput.addEventListener('focus', () => {
          if (!searchInput.value.trim()) {
            showSearchHistoryDropdown();
          }
        });

        // 搜索框 blur：延迟隐藏历史下拉列表
        searchInput.addEventListener('blur', () => {
          hideSearchHistoryDropdown();
        });

        // 搜索框输入时隐藏历史下拉列表
        searchInput.addEventListener('input', () => {
          if (searchInput.value.trim() && searchHistoryDropdown) {
            searchHistoryDropdown.style.display = 'none';
          }
        });

        // 清除搜索后，如果输入为空且获得焦点，显示历史下拉列表
        clearSearchBtn.addEventListener('click', () => {
          setTimeout(() => {
            if (!searchInput.value.trim() && document.activeElement === searchInput) {
              showSearchHistoryDropdown();
            }
          }, 50);
        });

        if (total > PAGE_SIZE) {
          updateLoadingProgress(renderedCount, total);
          setupScrollObserver();
        } else {
          showStatusMessage(`共 ${total} 条链接`);
        }

        console.log('[loadLinksFromStorage] 首屏加载完成');
      } catch (error) {
        console.error('[loadLinksFromStorage] 渲染链接时出错:', error.name, error.message, error.stack);
        logMessage(`渲染链接时出错: ${error.message}`);
        showStatusMessage('显示链接时出错: ' + error.message, true);
        showEmptyState(linksContainer);
      }
    } catch (error) {
      console.error('[loadLinksFromStorage] 加载数据错误:', error.name, error.message, error.stack);
      const errorMsg = error.message || '未知错误';
      logMessage('加载数据错误: ' + errorMsg);
      showStatusMessage('加载失败: ' + errorMsg, true);
      showEmptyState(linksContainer);
      loadedLinks = [];
    }
  }

  // HTML转义函数
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 渲染链接列表（支持搜索过滤）
  function renderLinksList(links) {
    renderLinks(
      linksContainer,
      links,
      handleDeleteLink,
      handleEditLink,
      handlePinLink,
      isDebugMode ? logMessage : null
    );

    // 渲染后添加归档按钮
    addArchiveButtons();

    // 渲染后应用文本截断
    if (currentSettings) {
      const cards = linksContainer.querySelectorAll('.link-card');
      cards.forEach(card => {
        applyTextTruncation(card, currentSettings);
      });
    }
  }

  // 给链接卡片添加归档按钮
  function addArchiveButtons() {
    const cards = linksContainer.querySelectorAll('.link-card');
    cards.forEach(card => {
      // 检查是否已经有归档按钮
      if (card.querySelector('.archive-btn')) return;

      const linkId = card.dataset.linkId;
      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'archive-btn';
      archiveBtn.innerHTML = '📦';
      archiveBtn.title = '归档';

      archiveBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await archiveLink(parseInt(linkId));
          showStatusMessage('已归档');
          
          // 只删除对应的 DOM 元素
          const cardElement = linksContainer.querySelector(`[data-link-id="${linkId}"]`);
          if (cardElement) {
            cardElement.remove();
          }
          
          // 从 loadedLinks 中移除该条数据
          const linkIdNum = parseInt(linkId);
          loadedLinks = loadedLinks.filter(l => l.id !== linkIdNum);
          renderedCount = Math.min(renderedCount, loadedLinks.length);

          // 更新搜索数据源（全量）
          if (updateSearchFn) {
            updateSearchFn(loadedLinks);
            refreshHistoryCache();
          }

          // 如果列表为空，显示空状态
          if (loadedLinks.length === 0) {
            showEmptyState(linksContainer);
          }
        } catch (error) {
          showStatusMessage('归档失败: ' + error.message, true);
        }
      });

      // 找到按钮容器并添加
      const actionsContainer = card.querySelector('.card-actions');
      if (actionsContainer) {
        actionsContainer.insertBefore(archiveBtn, actionsContainer.firstChild);
      }
    });
  }

  // 渲染归档链接列表
  function renderArchivedLinks(links) {
    if (!links || links.length === 0) {
      archivedContainer.innerHTML = '<div class="empty-state"><p>暂无已归档的链接</p></div>';
      return;
    }

    archivedContainer.innerHTML = links.map(link => `
      <div class="link-card" data-link-id="${link.id}">
        <div class="link-content">
          <a href="${escapeHtml(link.url)}" class="link-title" target="_blank">${escapeHtml(link.title)}</a>
          <a href="${escapeHtml(link.url)}" class="link-url" target="_blank">${escapeHtml(link.url)}</a>
        </div>
        <div class="link-meta">
          ${link.archivedAt ? `<span class="timestamp">归档于: ${formatDate(link.archivedAt)}</span>` : ''}
        </div>
        <div class="link-actions">
          <button class="action-btn unarchive" data-action="unarchive" title="取消归档">↩</button>
          <button class="action-btn delete" data-action="delete" title="删除">✕</button>
        </div>
      </div>
    `).join('');

    // 绑定事件
    archivedContainer.querySelectorAll('.action-btn.unarchive').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const linkId = parseInt(e.target.closest('.link-card').dataset.linkId);
        try {
          await unarchiveLink(linkId);
          showStatusMessage('已取消归档');
          // 刷新归档列表
          const archivedLinks = await loadArchivedLinks();
          renderArchivedLinks(archivedLinks);
        } catch (error) {
          showStatusMessage('取消归档失败: ' + error.message, true);
        }
      });
    });

    archivedContainer.querySelectorAll('.action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const linkId = parseInt(e.target.closest('.link-card').dataset.linkId);
        if (confirm('确定要删除这个链接吗？此操作不可恢复。')) {
          try {
            await deleteLinkFromStorage(linkId);
            showStatusMessage('链接已删除');
            // 刷新归档列表
            const archivedLinks = await loadArchivedLinks();
            renderArchivedLinks(archivedLinks);
          } catch (error) {
            showStatusMessage('删除失败: ' + error.message, true);
          }
        }
      });
    });
  }

  // 渲染搜索历史下拉列表
  function renderSearchHistory() {
    if (!searchHistoryDropdown) return;

    if (historyCache.length === 0) {
      searchHistoryDropdown.innerHTML = '<div class="search-history-item" style="color:#999; cursor:default;">暂无搜索历史</div>';
      searchHistoryDropdown.style.display = 'block';
      return;
    }

    const pinned = historyCache.filter(i => i.pinned);
    const unpinned = historyCache.filter(i => !i.pinned);

    let html = '';

    // Pinned 词区
    if (pinned.length > 0) {
      pinned.forEach(item => {
        html += `
          <div class="search-history-item" data-keyword="${escapeHtml(item.text)}">
            <span class="search-history-item-text">${escapeHtml(item.text)}</span>
            <div class="search-history-item-actions">
              <button class="search-history-pin-btn pinned" data-action="togglePin" data-keyword="${escapeHtml(item.text)}" title="取消固定">📌</button>
              <button class="search-history-delete-btn" data-action="delete" data-keyword="${escapeHtml(item.text)}" title="删除">✕</button>
            </div>
          </div>
        `;
      });
    }

    // 分隔线（同时有 pinned 和 unpinned 时显示）
    if (pinned.length > 0 && unpinned.length > 0) {
      html += '<div class="search-history-separator"></div>';
    }

    // 普通历史词区
    unpinned.forEach(item => {
      html += `
        <div class="search-history-item" data-keyword="${escapeHtml(item.text)}">
          <span class="search-history-item-text">${escapeHtml(item.text)}</span>
          <div class="search-history-item-actions">
            <button class="search-history-pin-btn" data-action="togglePin" data-keyword="${escapeHtml(item.text)}" title="固定">📌</button>
            <button class="search-history-delete-btn" data-action="delete" data-keyword="${escapeHtml(item.text)}" title="删除">✕</button>
          </div>
        </div>
      `;
    });

    searchHistoryDropdown.innerHTML = html;
    searchHistoryDropdown.style.display = 'block';
  }

  // 显示搜索历史下拉列表
  function showSearchHistoryDropdown() {
    clearTimeout(hideDropdownTimeout);
    renderSearchHistory();
  }

  // 隐藏搜索历史下拉列表
  function hideSearchHistoryDropdown() {
    hideDropdownTimeout = setTimeout(() => {
      if (searchHistoryDropdown) {
        searchHistoryDropdown.style.display = 'none';
      }
    }, 200);
  }

  // 刷新历史缓存并渲染
  async function refreshHistoryCache() {
    historyCache = await loadHistory();
    if (searchHistoryDropdown && searchHistoryDropdown.style.display === 'block') {
      renderSearchHistory();
    }
  }

  // 绑定搜索历史下拉列表事件
  function bindSearchHistoryEvents() {
    if (!searchHistoryDropdown) return;

    searchHistoryDropdown.addEventListener('click', async (e) => {
      e.stopPropagation();

      // 优先处理按钮点击（pin/delete）
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const keyword = actionBtn.dataset.keyword;

        if (action === 'togglePin') {
          await togglePinKeyword(keyword);
          await refreshHistoryCache();
        } else if (action === 'delete') {
          await deleteKeyword(keyword);
          await refreshHistoryCache();
        }
        return;
      }

      // 否则处理历史词文本点击
      const item = e.target.closest('.search-history-item');
      if (!item) return;

      const keyword = item.dataset.keyword;
      if (!keyword) return;

      // 如果点击的是按钮区域，不触发选择
      if (e.target.closest('.search-history-item-actions')) return;

      searchInput.value = keyword;
      searchHistoryDropdown.style.display = 'none';

      // 程序化赋值不会触发 input 事件，需手动同步清除按钮可见性
      if (clearSearchBtn) {
        clearSearchBtn.style.display = 'block';
      }

      // 触发搜索并记录
      await addSearchKeyword(keyword);
      const { searchLinks } = await import('./js/search.js');
      const filtered = searchLinks(keyword, loadedLinks);
      handleSearchResults(filtered, keyword);
    });

    // 下拉列表本身也需要阻止 blur 触发（防止点击下拉列表时先 blur searchInput）
    searchHistoryDropdown.addEventListener('mousedown', (e) => {
      e.preventDefault();
    });
  }

  // 处理搜索结果（全量数据搜索）
  async function handleSearchResults(filteredLinks, searchText) {
    // 记录搜索历史（有搜索内容时）
    if (searchText && searchText.trim()) {
      await addSearchKeyword(searchText.trim());
      // 刷新内存中的历史缓存，保证下次打开下拉能看到刚键入的词
      await refreshHistoryCache();
    }

    if (searchText) {
      // 进入搜索模式：销毁滚动观察器，直接渲染全部匹配结果
      isSearchActive = true;
      destroyScrollObserver();
      if (filteredLinks.length === 0) {
        showSearchEmptyState(linksContainer, searchText);
      } else {
        renderLinksList(filteredLinks);
      }
      // 搜索统计放到进度条容器里
      if (loadingProgress) {
        loadingProgress.textContent = `找到 ${filteredLinks.length} / ${loadedLinks.length} 条`;
        loadingProgress.classList.add('active');
      }
    } else {
      // 退出搜索模式：恢复滚动加载
      isSearchActive = false;
      renderedCount = 0;
      const initialBatch = loadedLinks.slice(0, PAGE_SIZE);
      renderLinksList(initialBatch);
      renderedCount = initialBatch.length;
      if (loadedLinks.length > PAGE_SIZE) {
        updateLoadingProgress(renderedCount, loadedLinks.length);
        setupScrollObserver();
      } else {
        if (loadingProgress) loadingProgress.classList.remove('active');
        showStatusMessage(`共 ${loadedLinks.length} 条链接`);
      }
    }
  }
  
  // 删除链接处理函数（现在接收 link 对象而不是 index）
  async function handleDeleteLink(link) {
    if (!link || !link.id) {
      showStatusMessage('删除失败：无效的链接', true);
      return;
    }
    
    // 确认删除
    if (confirm(`确定要删除链接 "${link.title || '无标题'}" 吗？`)) {
      try {
        // 从 IndexedDB 删除
        await deleteLinkFromStorage(link.id);
        
        showStatusMessage('链接已删除');
        
        // 只删除对应的 DOM 元素
        const cardElement = linksContainer.querySelector(`[data-link-id="${link.id}"]`);
        if (cardElement) {
          cardElement.remove();
        }
        
        // 从 loadedLinks 中移除该条数据
        loadedLinks = loadedLinks.filter(l => l.id !== link.id);
        renderedCount = Math.min(renderedCount, loadedLinks.length);

        // 更新搜索数据源（全量）
        if (updateSearchFn) {
          updateSearchFn(loadedLinks);
          refreshHistoryCache();
        }

        // 如果列表为空，显示空状态
        if (loadedLinks.length === 0) {
          showEmptyState(linksContainer);
        }
      } catch (error) {
        logMessage('删除链接失败: ' + error.message);
        showStatusMessage('删除失败', true);
      }
    }
  }
  
  // 显示编辑对话框
  function showEditDialog(link) {
    currentEditingLink = link;
    if (link) {
      // 编辑模式
      editDialogTitle.textContent = '编辑链接';
      editTitleInput.value = link.title || '';
      editUrlInput.value = link.url || '';
      // tags 可能是数组格式，需要转换为字符串显示
      editTagsInput.value = tagsArrayToString(link.tags) || '';
    } else {
      // 新增模式
      editDialogTitle.textContent = '新增链接';
      editTitleInput.value = '';
      editUrlInput.value = '';
      editTagsInput.value = '';
    }
    // 加载并渲染分组选择列表
    loadAndRenderGroups(link ? link.id : null);
    editDialogOverlay.classList.add('show');
    editTitleInput.focus();
  }

  /** 加载并渲染分组复选框列表，可选传入 linkId 进行预勾选 */
  async function loadAndRenderGroups(linkId) {
    const groups = await loadGroups();
    selectedGroupIds = [];
    groupSelectContainer.innerHTML = '';
    if (!groups || groups.length === 0) {
      groupSelectContainer.innerHTML = '<span style="font-size:12px;color:#999;">暂无分组，可新建</span>';
      return;
    }

    // 如果有 linkId，找出已属于哪些分组
    let existingGroupIds = new Set();
    if (linkId != null) {
      for (const g of groups) {
        if (g.linkIds && g.linkIds.includes(linkId)) {
          existingGroupIds.add(g.groupId);
        }
      }
    }

    for (const g of groups) {
      const div = document.createElement('div');
      div.className = 'group-checkbox-item';
      const isChecked = existingGroupIds.has(g.groupId);
      if (isChecked) selectedGroupIds.push(g.groupId);
      div.innerHTML = `<input type="checkbox" id="gcb_${g.groupId}" value="${g.groupId}" ${isChecked ? 'checked' : ''}><label for="gcb_${g.groupId}">${escapeHtml(g.groupName)}</label>`;
      groupSelectContainer.appendChild(div);
    }
  }

  /** 双向同步链接与分组的关联关系 */
  async function syncLinkGroups(linkId) {
    const checkboxes = groupSelectContainer.querySelectorAll('input[type="checkbox"]');
    const selected = new Set();
    for (const cb of checkboxes) {
      if (cb.checked) selected.add(cb.value);
    }

    // 先收集所有现有分组 ID
    const groups = await loadGroups();
    const groupIds = new Set(groups.map(g => g.groupId));

    // 从已取消勾选的分组中移除（仅编辑模式）
    for (const groupId of groupIds) {
      if (!selected.has(groupId)) {
        try {
          await removeLinkFromGroup(groupId, linkId);
        } catch (e) {
          console.error(`[popup] 从分组移除链接失败:`, e);
        }
      }
    }

    // 添加到新勾选的分组
    for (const groupId of selected) {
      try {
        await addLinkToGroup(groupId, linkId);
      } catch (e) {
        console.error(`[popup] 添加链接到分组失败:`, e);
      }
    }
  }

  // ========== 置顶分组 ==========

  /** 加载并渲染置顶分组横条 */
  async function loadAndRenderPinnedGroups() {
    const groups = await loadGroups();
    const pinned = (groups || []).filter(g => g.pinned);
    if (pinned.length === 0) {
      pinnedGroupsBar.style.display = 'none';
      return;
    }
    pinnedGroupsBar.style.display = 'block';
    pinnedGroupLabel.textContent = '置顶分组：';
    pinnedGroupList.innerHTML = '';
    for (const g of pinned) {
      const span = document.createElement('span');
      span.className = 'pinned-group-tag';
      span.textContent = g.groupName;
      span.title = g.groupName;
      span.addEventListener('click', () => {
        window.location.href = `group.html?groupId=${g.groupId}&from=home`;
      });
      pinnedGroupList.appendChild(span);
    }
  }

  // 获取当前标签页信息并打开新增对话框
  async function handleAddLink() {
    try {
      // 获取当前活动标签页
      const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tabs);
          }
        });
      });
      
      if (tabs.length === 0) {
        showStatusMessage('无法获取当前标签页信息', true);
        return;
      }
      
      const currentTab = tabs[0];
      const title = currentTab.title || '';
      const url = currentTab.url || '';
      
      // 打开编辑对话框并填充当前网页信息
      showEditDialog({
        title: title,
        url: url,
        tags: ''
      });
    } catch (error) {
      console.error('[handleAddLink] 获取标签页信息失败:', error);
      showStatusMessage('获取当前网页信息失败: ' + error.message, true);
      // 即使获取失败，也打开空的新增对话框
      showEditDialog(null);
    }
  }
  
  // 隐藏编辑对话框
  function hideEditDialog() {
    editDialogOverlay.classList.remove('show');
    currentEditingLink = null;
    editTitleInput.value = '';
    editUrlInput.value = '';
    editTagsInput.value = '';
    selectedGroupIds = [];
    if (groupSelectContainer) {
      const checkboxes = groupSelectContainer.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = false);
    }
  }
  
  // 编辑链接处理函数
  function handleEditLink(link) {
    showEditDialog(link);
  }
  
  // 置顶链接处理函数
  async function handlePinLink(link) {
    if (!link || !link.id) {
      showStatusMessage('操作失败：无效的链接', true);
      return;
    }
    
    try {
      // 切换置顶状态
      await togglePinLink(link.id);
      
      const isPinned = link.pinned || false; // 切换前的状态
      showStatusMessage(isPinned ? '已取消置顶' : '已置顶');
      logMessage(`${isPinned ? '取消置顶' : '置顶'}链接: ${link.title || '无标题'}`);
      
      // 置顶/取消置顶都会改变列表顺序，直接重新加载以保证顺序正确
      await loadLinksFromStorage();
    } catch (error) {
      logMessage('切换置顶状态失败: ' + error.message);
      showStatusMessage('操作失败', true);
    }
  }
  
  // 保存编辑或新增
  async function saveEdit() {
    const title = editTitleInput.value.trim();
    const url = editUrlInput.value.trim();
    const tags = editTagsInput.value.trim();
    
    // 验证
    if (!title || !url) {
      showStatusMessage('标题和网址不能为空', true);
      return;
    }
    
    // 提前保存编辑状态标记（在 hideEditDialog 清空 currentEditingLink 之前）
    const isEditMode = !!(currentEditingLink && currentEditingLink.id);
    const editingLinkId = isEditMode ? currentEditingLink.id : null;
    
    try {
      if (isEditMode) {
        // 编辑模式：更新链接
        await updateLink(editingLinkId, {
          title: title,
          url: url,
          tags: tags
        });
        
        showStatusMessage('链接已更新');
        logMessage(`更新链接: ${title}`);
      } else {
        // 新增模式：添加链接
        const newLink = {
          title: title,
          url: url,
          tags: tags,
          timestamp: new Date().toISOString(),
          pinned: false
        };

        // addLink 返回的是 ID（数字），不是对象
        const addedId = await addLink(newLink);

        showStatusMessage('链接已添加');
        logMessage(`添加链接: ${title}`);

        // 构造完整的链接对象用于更新 loadedLinks 和 DOM
        if (addedId) {
          const addedLink = { ...newLink, id: addedId };
          loadedLinks.unshift(addedLink); // 新链接添加到列表开头

          // 更新搜索数据源（全量）
          if (updateSearchFn) {
            updateSearchFn(loadedLinks);
            refreshHistoryCache();
          }

          // 创建新卡片并插入到容器顶部
          const { createLinkCard } = await import('./js/render.js');
          const newCard = createLinkCard(addedLink, 0, handleDeleteLink, handleEditLink, handlePinLink, isDebugMode ? logMessage : null);
          linksContainer.insertBefore(newCard, linksContainer.firstChild);

          // 为新卡片添加归档按钮和文本截断
          addArchiveButtons();
          if (currentSettings) {
            applyTextTruncation(newCard, currentSettings);
          }
          renderedCount += 1;
        }

        // 关联分组（新增模式）——在 hideEditDialog 之前调用，否则 checkbox 已被清空
        await syncLinkGroups(addedId);

        // 刷新置顶分组横条
        loadAndRenderPinnedGroups();

        // 隐藏对话框（放在最后）
        hideEditDialog();

        return;
      }

      // 编辑模式：双向同步分组（在 hideEditDialog 之前，此时 checkbox 状态还在）
      await syncLinkGroups(editingLinkId);

      // 刷新置顶分组横条
      loadAndRenderPinnedGroups();

      // 编辑模式：隐藏对话框
      hideEditDialog();
      
      // 编辑模式：直接更新对应的 DOM 卡片（editingLinkId 已在 try 之前保存）
      const cardElement = linksContainer.querySelector(`[data-link-id="${editingLinkId}"]`);
      if (cardElement) {
        try {
          // 更新标题
          const titleElement = cardElement.querySelector('.link-title');
          if (titleElement) {
            titleElement.textContent = title;
            titleElement.removeAttribute('data-original-title');
            titleElement.removeAttribute('title');
          }
          
          // 更新URL（尝试找 .link-url 中的 a 标签，或直接在 .link-url 上）
          let urlElement = cardElement.querySelector('.link-url a');
          if (!urlElement) {
            // 如果没有 a 标签，尝试直接在 .link-url 上
            urlElement = cardElement.querySelector('.link-url');
          }
          if (urlElement) {
            if (urlElement.tagName === 'A') {
              urlElement.href = url;
            }
            urlElement.textContent = url;
            urlElement.removeAttribute('data-original-url');
            urlElement.removeAttribute('title');
          }
          
          // 更新标签（与 createLinkCard 保持一致，用 <span> 渲染每个标签）
          const tagsElement = cardElement.querySelector('.link-tags');
          if (tagsElement) {
            tagsElement.innerHTML = '';
            const tagArray = parseTags(tags);
            tagArray.forEach(tag => {
              const tagSpan = document.createElement('span');
              tagSpan.textContent = tag;
              tagsElement.appendChild(tagSpan);
            });
          }
          
          // 应用文本截断（基于设置）
          if (currentSettings) {
            applyTextTruncation(cardElement, currentSettings);
          }
        } catch (domError) {
          console.warn('[编辑-DOM更新] 更新卡片DOM出错:', domError);
          // 如果DOM更新失败，不影响后续的搜索源更新
        }
      }
      
      // 编辑模式：重新加载链接数据以获取最新数据用于搜索
      const updatedLinks = await loadLinks();
      loadedLinks = updatedLinks;

      // 更新搜索数据源（全量）
      if (updateSearchFn) {
        updateSearchFn(loadedLinks);
        refreshHistoryCache();
      }
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      const action = isEditMode ? '更新' : '添加';
      logMessage(`${action}链接失败: ` + errorMsg);
      showStatusMessage(`${action}失败: ` + errorMsg, true);
    }
  }
  
  // 绑定编辑对话框事件
  editCancelBtn.addEventListener('click', hideEditDialog);
  editSaveBtn.addEventListener('click', saveEdit);
  
  // 点击遮罩层关闭对话框
  editDialogOverlay.addEventListener('click', function(e) {
    if (e.target === editDialogOverlay) {
      hideEditDialog();
    }
  });

  // ========== 新建分组弹窗 ==========
  if (newGroupBtn) {
    newGroupBtn.addEventListener('click', () => {
      groupDialogOverlay.classList.add('show');
      newGroupNameInput.value = '';
      newGroupNameInput.focus();
    });
  }

  if (groupCancelBtn) {
    groupCancelBtn.addEventListener('click', () => {
      groupDialogOverlay.classList.remove('show');
    });
  }

  if (groupSaveBtn) {
    groupSaveBtn.addEventListener('click', async () => {
      const name = newGroupNameInput.value.trim();
      if (!name) {
        showStatusMessage('请输入分组名称', true);
        return;
      }
      try {
        const groupId = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await addGroup({ groupId, groupName: name, order: 0, linkIds: [] });
        showStatusMessage(`已创建分组 "${name}"`);
        groupDialogOverlay.classList.remove('show');
        // 重新加载分组列表并自动选中新建的分组
        await loadAndRenderGroups();
        const cb = document.getElementById('gcb_' + groupId);
        if (cb) cb.checked = true;
      } catch (e) {
        console.error('[popup] 创建分组失败:', e);
        showStatusMessage('创建分组失败', true);
      }
    });
  }

  // 点击遮罩层关闭分组弹窗
  if (groupDialogOverlay) {
    groupDialogOverlay.addEventListener('click', function(e) {
      if (e.target === groupDialogOverlay) {
        groupDialogOverlay.classList.remove('show');
      }
    });
  }

  // 分组输入框按 Enter 直接创建
  if (newGroupNameInput) {
    newGroupNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        groupSaveBtn.click();
      }
    });
  }
  
  // ESC 键关闭对话框或整个弹窗
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (groupDialogOverlay && groupDialogOverlay.classList.contains('show')) {
        groupDialogOverlay.classList.remove('show');
      } else if (editDialogOverlay.classList.contains('show')) {
        hideEditDialog();
      } else if (settingsDialogOverlay.classList.contains('show')) {
        hideSettingsDialog();
      } else {
        // 没有对话框打开时，关闭整个弹窗
        window.close();
      }
    }
  });
  
  // 在编辑对话框中按 Enter 保存
  editTitleInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveEdit();
    }
  });
  
  editUrlInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveEdit();
    }
  });
  
  editTagsInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveEdit();
    }
  });
  
  // 导入收藏夹
  async function handleImportBookmarks() {
    // 确认导入
    if (!confirm('确定要导入浏览器收藏夹吗？\n\n这将读取所有收藏夹并添加到阅读列表中，已存在的链接将被跳过。')) {
      return;
    }
    
    // 禁用按钮，防止重复点击
    importBookmarksBtn.disabled = true;
    importBookmarksBtn.textContent = '导入中...';
    
    try {
      showStatusMessage('正在读取收藏夹...');
      logMessage('开始导入收藏夹');
      
      // 进度回调
      const onProgress = (imported, skipped, processed, total) => {
        showStatusMessage(`正在导入... 已导入 ${imported} 条，跳过 ${skipped} 条 (${processed} / ${total})`);
        if (isDebugMode) {
          logMessage(`导入进度: ${imported} 已导入, ${skipped} 跳过, ${processed}/${total} 已处理`);
        }
      };
      
      // 执行导入
      const result = await importBookmarks(onProgress);
      
      // 显示结果
      let resultMessage = `导入完成！成功导入 ${result.imported} 条链接`;
      if (result.skipped > 0) {
        resultMessage += `，跳过 ${result.skipped} 条重复链接`;
      }
      resultMessage += `（共 ${result.total} 条）`;
      
      showStatusMessage(resultMessage);
      logMessage(resultMessage);
      
      // 重新加载链接列表
      await loadLinksFromStorage();
      
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('导入收藏夹失败: ' + errorMsg);
      showStatusMessage('导入失败: ' + errorMsg, true);
    } finally {
      // 恢复按钮状态
      importBookmarksBtn.disabled = false;
      importBookmarksBtn.textContent = '导入系统收藏夹';
    }
  }
  
  // 导出数据
  async function exportData() {
    try {
      const links = await exportLinks();
      
      if (!links || links.length === 0) {
        showStatusMessage('没有数据可以导出', true);
        return;
      }
      
      // 创建导出数据
      const exportData = JSON.stringify(links, null, 2);
      const blob = new Blob([exportData], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = `reading_links_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      
      // 清理
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      showStatusMessage('数据导出成功');
    } catch (error) {
      logMessage(`导出数据时出错: ${error.message}`);
      showStatusMessage('导出数据时出错', true);
    }
  }
  
  // 导入 JSON 文件
  async function handleImportJson() {
    // 触发文件选择
    jsonFileInput.click();
  }
  
  // 处理文件选择
  jsonFileInput.addEventListener('change', async function(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    
    // 验证文件类型
    if (!file.name.endsWith('.json')) {
      showStatusMessage('请选择 JSON 格式的文件', true);
      // 重置文件输入
      jsonFileInput.value = '';
      return;
    }
    
    // 禁用按钮，防止重复点击
    settingsImportBtn.disabled = true;
    settingsImportBtn.textContent = '导入中...';
    
    try {
      showStatusMessage('正在读取文件...');
      logMessage('开始导入 JSON 文件');
      
      // 读取文件内容
      const fileContent = await readFileAsText(file);
      
      // 解析 JSON
      let links;
      try {
        links = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error('JSON 文件格式错误，无法解析');
      }
      
      // 验证数据格式
      if (!Array.isArray(links)) {
        throw new Error('JSON 文件格式错误：数据必须是数组格式');
      }
      
      if (links.length === 0) {
        showStatusMessage('JSON 文件中没有数据');
        // 重置文件输入
        jsonFileInput.value = '';
        return;
      }
      
      // 验证每条数据的格式
      const validLinks = [];
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link && typeof link === 'object') {
          // 至少需要有 title 或 url
          if (link.title || link.url) {
            validLinks.push(link);
          } else {
            logMessage(`跳过第 ${i + 1} 条无效数据：缺少 title 或 url`);
          }
        } else {
          logMessage(`跳过第 ${i + 1} 条无效数据：不是对象格式`);
        }
      }
      
      if (validLinks.length === 0) {
        throw new Error('JSON 文件中没有有效的数据');
      }
      
      showStatusMessage(`正在导入 ${validLinks.length} 条链接...`);
      logMessage(`准备导入 ${validLinks.length} 条有效链接（共 ${links.length} 条）`);
      
      // 使用 batchAddLinks 批量导入（会自动处理重复的 URL）
      // 添加进度反馈
      let processedCount = 0;
      const totalCount = validLinks.length;
      const progressInterval = setInterval(() => {
        if (processedCount < totalCount) {
          showStatusMessage(`正在导入... ${processedCount} / ${totalCount} 条`);
        }
      }, 500); // 每 500ms 更新一次进度
      
      try {
        console.log('[handleImportJson] 开始调用 batchAddLinks，数据条数:', validLinks.length);
        console.log('[handleImportJson] 前2条数据示例:', validLinks.slice(0, 2));
        const result = await batchAddLinks(validLinks);
        clearInterval(progressInterval);
        
        console.log('[handleImportJson] batchAddLinks 返回结果:', result);
        
        const imported = result.imported;
        const skipped = result.skipped;
        
        // 显示结果
        let resultMessage = `导入完成！成功导入 ${imported} 条链接`;
        if (skipped > 0) {
          resultMessage += `，跳过 ${skipped} 条重复链接`;
        }
        if (validLinks.length < links.length) {
          resultMessage += `（共 ${links.length} 条，${validLinks.length} 条有效）`;
        }
        
        showStatusMessage(resultMessage);
        logMessage(resultMessage);
        console.log('导入结果:', result);
        
        // 重新加载链接列表
        console.log('开始重新加载链接列表...');
        await loadLinksFromStorage();
        console.log('链接列表重新加载完成');
      } catch (importError) {
        clearInterval(progressInterval);
        console.error('批量导入过程中出错:', importError.name, importError.message, importError.stack);
        logMessage(`批量导入失败: ${importError.message || importError.name || '未知错误'}`);
        throw importError;
      }
      
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('导入 JSON 文件失败: ' + errorMsg);
      showStatusMessage('导入失败: ' + errorMsg, true);
    } finally {
      // 恢复按钮状态
      settingsImportBtn.disabled = false;
      settingsImportBtn.textContent = '导入';
      // 重置文件输入，允许再次选择同一文件
      jsonFileInput.value = '';
    }
  });
  
  // 读取文件为文本
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('读取文件失败'));
      reader.readAsText(file, 'UTF-8');
    });
  }
  
  // ========== 设置功能 ==========
  
  /**
   * 加载并应用设置
   */
  async function loadAndApplySettings() {
    try {
      currentSettings = await loadSettings();
      applySettingsToUI(currentSettings);
    } catch (error) {
      logMessage('加载设置失败: ' + error.message);
      // 使用默认设置
      currentSettings = await loadSettings();
      applySettingsToUI(currentSettings);
    }
  }
  
  /**
   * 截断文本并添加省略号
   * @param {string} text - 原始文本
   * @param {number} maxChars - 最大字符数（0表示不限制）
   * @returns {string} 截断后的文本
   */
  function truncateText(text, maxChars) {
    if (!text) return '';
    if (!maxChars || maxChars <= 0) {
      return text;
    }
    if (text.length <= maxChars) {
      return text;
    }
    return text.substring(0, maxChars) + '...';
  }
  
  /**
   * 应用文本截断到链接卡片
   * @param {HTMLElement} card - 链接卡片元素
   * @param {Object} settings - 设置对象
   */
  function applyTextTruncation(card, settings) {
    const compactMode = settings.compactMode || {};
    const titleMaxChars = compactMode.titleMaxChars || 0;
    const urlMaxChars = compactMode.urlMaxChars || 0;
    
    // 处理标题（现在是 <a> 标签）
    const titleElement = card.querySelector('.link-title');
    if (titleElement && titleMaxChars > 0) {
      const originalTitle = titleElement.getAttribute('data-original-title') || titleElement.textContent;
      titleElement.setAttribute('data-original-title', originalTitle);
      const truncatedTitle = truncateText(originalTitle, titleMaxChars);
      titleElement.textContent = truncatedTitle;
      // 悬停显示完整内容（保留原始title，如果已设置）
      if (originalTitle && originalTitle !== truncatedTitle) {
        titleElement.title = originalTitle;
      }
    } else if (titleElement) {
      // 如果不限制，确保显示完整内容
      const originalTitle = titleElement.getAttribute('data-original-title');
      if (originalTitle) {
        titleElement.textContent = originalTitle;
        titleElement.removeAttribute('data-original-title');
        // 保留title属性（用于悬停提示）
        if (titleElement.title === originalTitle) {
          titleElement.title = originalTitle; // 保持原样
        }
      }
    }
    
    // 处理URL
    const urlElement = card.querySelector('.link-url a');
    if (urlElement && urlMaxChars > 0) {
      const originalUrl = urlElement.getAttribute('data-original-url') || urlElement.textContent;
      urlElement.setAttribute('data-original-url', originalUrl);
      const truncatedUrl = truncateText(originalUrl, urlMaxChars);
      urlElement.textContent = truncatedUrl;
      urlElement.title = originalUrl; // 悬停显示完整内容
    } else if (urlElement) {
      // 如果不限制，确保显示完整内容
      const originalUrl = urlElement.getAttribute('data-original-url');
      if (originalUrl) {
        urlElement.textContent = originalUrl;
        urlElement.removeAttribute('data-original-url');
        urlElement.removeAttribute('title');
      }
    }
  }
  
  /**
   * 应用设置到UI
   * @param {Object} settings - 设置对象
   */
  function applySettingsToUI(settings) {
    const compactMode = settings.compactMode || {};
    
    // 应用紧凑模式类
    if (compactMode.enabled) {
      linksContainer.classList.add('compact-mode');
    } else {
      linksContainer.classList.remove('compact-mode');
    }
    
    // 应用显示/隐藏选项
    // 注意：showUrl/showDate/showTags 为 true 时显示，false 时隐藏
    // 所以类名是 hide-url/hide-date/hide-tags（隐藏时添加）
    if (compactMode.showUrl === false) {
      linksContainer.classList.add('hide-url');
    } else {
      linksContainer.classList.remove('hide-url');
    }
    
    if (compactMode.showDate === false) {
      linksContainer.classList.add('hide-date');
    } else {
      linksContainer.classList.remove('hide-date');
    }
    
    if (compactMode.showTags === false) {
      linksContainer.classList.add('hide-tags');
    } else {
      linksContainer.classList.remove('hide-tags');
    }
    
    // 应用文本截断
    if (currentSettings) {
      const cards = linksContainer.querySelectorAll('.link-card');
      cards.forEach(card => {
        applyTextTruncation(card, currentSettings);
      });
    }

    // 显示 deviceId
    if (typeof deviceIdInput !== 'undefined' && deviceIdInput) {
      deviceIdInput.value = settings.deviceId || '';
    }
  }
  
  /**
   * 显示设置对话框
   */
  function showSettingsDialog() {
    if (!currentSettings) {
      return;
    }

    const compactMode = currentSettings.compactMode || {};

    // 填充当前设置值
    compactModeCheckbox.checked = compactMode.enabled || false;
    showUrlCheckbox.checked = compactMode.showUrl !== false; // 默认为 true
    showDateCheckbox.checked = compactMode.showDate !== false; // 默认为 true
    showTagsCheckbox.checked = compactMode.showTags !== false; // 默认为 true
    titleMaxCharsInput.value = compactMode.titleMaxChars || 0;
    urlMaxCharsInput.value = compactMode.urlMaxChars || 0;

    // 加载并显示统计信息
    loadAndShowStats();

    // 填充同步设置
    if (syncPeerUrlInput) {
      syncPeerUrlInput.value = currentSettings.syncPeerUrl || '';
    }
    if (syncStatusText) {
      syncStatusText.textContent = '';
    }

    // 填充搜索历史设置
    if (currentSettings && currentSettings.searchHistory) {
      searchHistoryMaxCountInput.value = currentSettings.searchHistory.maxCount || 10;
    }

    // 显示对话框
    settingsDialogOverlay.classList.add('show');
  }

  // 加载并显示统计信息
  async function loadAndShowStats() {
    try {
      // 获取链接数量（不包含已归档的）
      const links = await loadLinks(false);
      const linkCount = links ? links.length : 0;

      // 获取分组数量
      const groups = await loadGroups();
      const groupCount = groups ? groups.length : 0;

      // 获取已归档数量
      const archivedLinks = await loadArchivedLinks();
      const archivedCount = archivedLinks ? archivedLinks.length : 0;

      // 估算数据大小
      const allData = [...(links || []), ...(archivedLinks || [])];
      const bytes = new Blob([JSON.stringify(allData)]).size;
      const sizeText = bytes < 1024 * 1024
        ? (bytes / 1024).toFixed(1) + ' KB'
        : (bytes / (1024 * 1024)).toFixed(2) + ' MB';

      // 更新显示
      if (linkCountSpan) linkCountSpan.textContent = linkCount;
      if (groupCountSpan) groupCountSpan.textContent = groupCount;
      if (archivedCountSpan) archivedCountSpan.textContent = archivedCount;
      if (dataSizeSpan) dataSizeSpan.textContent = sizeText + '（估算）';
    } catch (error) {
      console.error('加载统计信息失败:', error);
      if (linkCountSpan) linkCountSpan.textContent = '-';
      if (groupCountSpan) groupCountSpan.textContent = '-';
      if (archivedCountSpan) archivedCountSpan.textContent = '-';
      if (dataSizeSpan) dataSizeSpan.textContent = '-';
    }
  }

  // 重置/生成新的 deviceId
  if (typeof regenerateDeviceIdBtn !== 'undefined' && regenerateDeviceIdBtn) {
    regenerateDeviceIdBtn.addEventListener('click', async () => {
      try {
        const newId = generateUUIDv4();
        if (deviceIdInput) deviceIdInput.value = newId;
        const settingsWithDevice = { ...(currentSettings || {}), deviceId: newId };
        await saveSettings(settingsWithDevice);
        currentSettings = settingsWithDevice;
        showStatusMessage('已生成新的 device_id');
        logMessage('生成新的 device_id: ' + newId);
      } catch (e) {
        console.error('重置 device_id 失败', e);
        showStatusMessage('重置 device_id 失败', true);
      }
    });
  }
  
  /**
   * 隐藏设置对话框
   */
  function hideSettingsDialog() {
    settingsDialogOverlay.classList.remove('show');
  }
  
  /**
   * 保存设置
   */
  async function saveSettingsAndApply() {
    try {
      const compactModeEnabled = compactModeCheckbox.checked;
      const showUrl = showUrlCheckbox.checked;
      const showDate = showDateCheckbox.checked;
      const showTags = showTagsCheckbox.checked;
      const titleMaxChars = parseInt(titleMaxCharsInput.value) || 0;
      const urlMaxChars = parseInt(urlMaxCharsInput.value) || 0;
      
      // 验证输入
      if (titleMaxChars < 0 || urlMaxChars < 0) {
        showStatusMessage('字符数不能为负数', true);
        return;
      }

      // 验证 deviceId 非空（允许用户自定义）
      if (typeof deviceIdInput !== 'undefined' && deviceIdInput) {
        const candidate = (deviceIdInput.value || '').trim();
        if (!candidate) {
          showStatusMessage('device_id 不能为空，请填写或点击重置生成。', true);
          return;
        }
      }
      
      // 更新设置（立即更新 UI，后台异步持久化以减少延迟）
      // 获取同步 peer URL
      const syncPeerUrl = syncPeerUrlInput ? (syncPeerUrlInput.value || '').trim() : '';

      const updatedSettings = {
        ...currentSettings,
        syncPeerUrl: syncPeerUrl,
        compactMode: {
          ...((currentSettings && currentSettings.compactMode) || {}),
          enabled: compactModeEnabled,
          showUrl: showUrl,
          showDate: showDate,
          showTags: showTags,
          titleMaxChars: titleMaxChars,
          urlMaxChars: urlMaxChars
        },
        searchHistory: {
          maxCount: parseInt(searchHistoryMaxCountInput.value) || 10
        }
      };

      currentSettings = updatedSettings;

      // 更新搜索历史最大条数
      const newMaxCount = parseInt(searchHistoryMaxCountInput.value) || 10;
      await setMaxCount(newMaxCount);
      await refreshHistoryCache();

      // 异步保存到存储，失败时记录但不阻塞 UI
      saveSettings(updatedSettings).catch(err => {
        logMessage('异步保存设置失败: ' + (err && err.message));
        showStatusMessage('保存设置失败（请重试）', true);
      });

      // 保存 deviceId（如果 UI 中有值）——也以异步方式持久化
      if (typeof deviceIdInput !== 'undefined' && deviceIdInput) {
        const newDeviceId = (deviceIdInput.value || '').trim();
        if (newDeviceId) {
          const settingsWithDevice = { ...currentSettings, deviceId: newDeviceId };
          // persist asynchronously
          saveSettings(settingsWithDevice).then(() => {
            currentSettings = settingsWithDevice;
            logMessage('device_id 已保存');
          }).catch(e => {
            console.warn('保存 device_id 失败', e);
            showStatusMessage('保存 device_id 失败', true);
          });
        }
      }
      
      // 应用设置到UI
      applySettingsToUI(currentSettings);
      
      // 重新渲染链接列表（以便应用新的样式和截断）
      if (loadedLinks.length > 0) {
        renderLinksList(loadedLinks);
      }
      
      showStatusMessage('设置已保存');
      const logMsg = `设置已保存: 紧凑模式 ${compactModeEnabled ? '已启用' : '已禁用'}, ` +
                     `显示网址: ${showUrl ? '是' : '否'}, ` +
                     `显示日期: ${showDate ? '是' : '否'}, ` +
                     `显示标签: ${showTags ? '是' : '否'}, ` +
                     `标题最大字符数: ${titleMaxChars || '不限制'}, ` +
                     `URL最大字符数: ${urlMaxChars || '不限制'}`;
      logMessage(logMsg);
      
      // 隐藏对话框
      hideSettingsDialog();
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('保存设置失败: ' + errorMsg);
      showStatusMessage('保存设置失败: ' + errorMsg, true);
    }
  }

  // iframe 覆盖层相关
  const iframeOverlay = document.getElementById('iframeOverlay');
  const overlayIframe = document.getElementById('overlayIframe');

  function openIframeOverlay(url) {
    overlayIframe.src = url;
    iframeOverlay.classList.add('show');
  }

  async function closeIframeOverlay() {
    iframeOverlay.classList.remove('show');
    overlayIframe.src = '';
    // 子页面可能修改了分组置顶状态，关闭后刷新置顶横条
    loadAndRenderPinnedGroups();
  }

  // 子页面可通过 postMessage 请求关闭 overlay
  window.addEventListener('message', (event) => {
    if (event.data === 'closeOverlay') {
      closeIframeOverlay();
    }
  });

  // 绑定分组管理按钮事件
  const groupsBtn = document.getElementById('groupsBtn');
  groupsBtn.addEventListener('click', function() {
    openIframeOverlay('group.html');
  });

  // 选中文本按钮
  const selectionsBtn = document.getElementById('selectionsBtn');
  selectionsBtn.addEventListener('click', () => {
    openIframeOverlay('selections.html');
  });

  // 绑定设置对话框事件
  settingsBtn.addEventListener('click', showSettingsDialog);
  settingsCancelBtn.addEventListener('click', hideSettingsDialog);
  settingsSaveBtn.addEventListener('click', saveSettingsAndApply);

  // 同步拉取按钮
  if (syncPullBtn) {
    syncPullBtn.addEventListener('click', async () => {
      const peerUrl = syncPeerUrlInput ? syncPeerUrlInput.value.trim() : '';
      if (!peerUrl) {
        if (syncStatusText) syncStatusText.textContent = '请先输入对端 URL';
        return;
      }
      if (syncStatusText) syncStatusText.textContent = '正在拉取...';
      try {
        const res = await chrome.runtime.sendMessage({ type: 'sync.pull', peerId: peerUrl, entityType: 'LINK' });
        if (res && res.success) {
          const cursor = res.data?.latestCursor || '-';
          if (syncStatusText) syncStatusText.textContent = `拉取成功，cursor: ${cursor}`;
          // 刷新链接列表
          loadedLinks = await loadLinks(false);
          renderLinksList(loadedLinks);
        } else {
          if (syncStatusText) syncStatusText.textContent = `拉取失败: ${res?.reason || '未知错误'}`;
        }
      } catch (e) {
        if (syncStatusText) syncStatusText.textContent = '拉取异常: ' + e.message;
      }
    });
  }

  // 同步推送按钮
  if (syncPushBtn) {
    syncPushBtn.addEventListener('click', async () => {
      const peerUrl = syncPeerUrlInput ? syncPeerUrlInput.value.trim() : '';
      if (!peerUrl) {
        if (syncStatusText) syncStatusText.textContent = '请先输入对端 URL';
        return;
      }
      if (syncStatusText) syncStatusText.textContent = '正在推送...';
      try {
        const res = await chrome.runtime.sendMessage({ type: 'sync.push', peerId: peerUrl, entityType: 'LINK' });
        if (res && res.success) {
          const ack = res.ackCursor || '-';
          if (syncStatusText) syncStatusText.textContent = `推送成功，ackCursor: ${ack}`;
        } else {
          if (syncStatusText) syncStatusText.textContent = `推送失败: ${res?.reason || '未知错误'}`;
        }
      } catch (e) {
        if (syncStatusText) syncStatusText.textContent = '推送异常: ' + e.message;
      }
    });
  }

  // 点击遮罩层关闭设置对话框
  settingsDialogOverlay.addEventListener('click', function(e) {
    if (e.target === settingsDialogOverlay) {
      hideSettingsDialog();
    }
  });

  // 查看归档按钮
  viewArchivedBtn.addEventListener('click', async () => {
    hideSettingsDialog();
    // 加载归档链接
    const archivedLinks = await loadArchivedLinks();
    console.log('[popup] 归档链接数量:', archivedLinks?.length || 0);
    if (archivedLinks && archivedLinks.length > 0) {
      console.log('[popup] 归档链接详情:', JSON.stringify(archivedLinks.map(l => ({id: l.id, title: l.title, archived: l.archived}))));
    }
    // 渲染归档列表
    renderArchivedLinks(archivedLinks);
    // 显示归档视图
    linksContainer.style.display = 'none';
    archivedView.style.display = 'block';
  });

  // 从归档返回按钮
  backFromArchivedBtn.addEventListener('click', () => {
    archivedView.style.display = 'none';
    linksContainer.style.display = 'block';
  });

  // ========== 设置功能结束 ==========
  
  // 清除所有数据
  async function handleClearData() {
    // 确认清除
    if (!confirm('警告：确定要清除所有数据吗？\n\n这将删除所有保存的链接，此操作不可恢复！\n\n建议先导出数据备份。')) {
      return;
    }
    
    // 二次确认
    if (!confirm('最后确认：真的要删除所有数据吗？')) {
      return;
    }
    
    // 禁用按钮
    clearDataBtn.disabled = true;
    clearDataBtn.textContent = '清除中...';
    
    try {
      showStatusMessage('正在清除数据...');
      logMessage('开始清除数据库');
      
      await clearDatabaseFromStorage();
      
      showStatusMessage('数据已清除');
      logMessage('数据库清除成功');
      
      // 重新加载（会创建新的空数据库）
      await loadLinksFromStorage();
      
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('清除数据失败: ' + errorMsg);
      showStatusMessage('清除失败: ' + errorMsg, true);
    } finally {
      // 恢复按钮状态
      clearDataBtn.disabled = false;
      clearDataBtn.textContent = '清除数据';
    }
  }
  
  // 快捷键配置提示
  function checkAndShowShortcutTip() {
    // 检查是否已经配置了快捷键（通过检查是否显示过提示）
    chrome.storage.local.get(['shortcutTipDismissed'], (result) => {
      if (!result.shortcutTipDismissed && shortcutTip) {
        shortcutTip.style.display = 'block';
      }
    });
  }
  
  // 检测浏览器类型
  function getBrowserType() {
    // 通过 userAgent 检测
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('edg/')) {
      return 'edge';
    } else if (userAgent.includes('chrome/')) {
      return 'chrome';
    }
    // 默认尝试 Chrome
    return 'chrome';
  }
  
  // 配置快捷键按钮
  if (configureShortcutBtn) {
    configureShortcutBtn.addEventListener('click', () => {
      // 根据浏览器类型选择正确的 URL
      const browserType = getBrowserType();
      const shortcutsUrl = browserType === 'edge' 
        ? 'edge://extensions/shortcuts' 
        : 'chrome://extensions/shortcuts';
      
      chrome.tabs.create({
        url: shortcutsUrl
      }, () => {
        // 如果打开失败，尝试另一个浏览器的 URL
        if (chrome.runtime.lastError) {
          const altUrl = browserType === 'edge' 
            ? 'chrome://extensions/shortcuts' 
            : 'edge://extensions/shortcuts';
          chrome.tabs.create({ url: altUrl });
        }
      });
    });
  }
  
  // 不再提示按钮
  if (dismissShortcutTipBtn) {
    dismissShortcutTipBtn.addEventListener('click', () => {
      chrome.storage.local.set({ shortcutTipDismissed: true }, () => {
        if (shortcutTip) {
          shortcutTip.style.display = 'none';
        }
      });
    });
  }
  
  // 使用说明弹窗
  const helpBtn = document.getElementById('helpBtn');
  const helpDialogOverlay = document.getElementById('helpDialogOverlay');
  const helpCloseBtn = document.getElementById('helpCloseBtn');
  helpBtn.addEventListener('click', () => helpDialogOverlay.classList.add('show'));
  helpCloseBtn.addEventListener('click', () => helpDialogOverlay.classList.remove('show'));
  helpDialogOverlay.addEventListener('click', (e) => { if (e.target === helpDialogOverlay) helpDialogOverlay.classList.remove('show'); });

  // 绑定按钮事件
  addBtn.addEventListener('click', handleAddLink);
  importBookmarksBtn.addEventListener('click', handleImportBookmarks);
  exportBtn.addEventListener('click', exportData);
  settingsImportBtn.addEventListener('click', handleImportJson);
  settingsExportBtn.addEventListener('click', exportData);
  clearDataBtn.addEventListener('click', handleClearData);
  debugBtn.addEventListener('click', toggleDebugMode);
  
  // 初始加载
  // 先加载设置，再加载链接
  console.log('[popup] 开始初始加载');

  // 绑定搜索历史事件
  bindSearchHistoryEvents();

  loadAndApplySettings().then(() => {
    console.log('[popup] 设置加载完成，开始加载链接');
    loadLinksFromStorage();
    // 检查并显示快捷键配置提示
    checkAndShowShortcutTip();
    // 刷新历史缓存
    refreshHistoryCache();
    // 加载置顶分组横条
    loadAndRenderPinnedGroups();
  }).catch(error => {
    console.error('[popup] 初始加载失败:', error);
  });
  
  // 窗口关闭时销毁滚动观察器
  window.addEventListener('beforeunload', destroyScrollObserver);
  
  // 测试 Service Worker 是否运行
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[popup] Service Worker 可能未运行:', chrome.runtime.lastError.message);
    } else {
      console.log('[popup] Service Worker 响应:', response);
    }
  });
}); 
