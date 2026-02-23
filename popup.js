// 导入模块
import { showStatus, log, tagsArrayToString, formatDate } from './js/utils.js';
import { renderLinks, showEmptyState, showSearchEmptyState } from './js/render.js';
import { loadLinks, loadGroups, loadArchivedLinks, archiveLink, unarchiveLink, deleteLink as deleteLinkFromStorage, updateLink, exportLinks, batchAddLinks, togglePinLink, clearDatabase as clearDatabaseFromStorage, addLink } from './js/storage.js';
import { importBookmarks } from './js/bookmarks.js';
import { setupSearch } from './js/search.js';
import { loadSettings, saveSettings, updateCompactModeSettings } from './js/settings.js';

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
  
  // 编辑对话框元素
  const editDialogOverlay = document.getElementById('editDialogOverlay');
  const editDialogTitle = document.querySelector('#editDialogOverlay h2');
  const editTitleInput = document.getElementById('editTitleInput');
  const editUrlInput = document.getElementById('editUrlInput');
  const editTagsInput = document.getElementById('editTagsInput');
  const editCancelBtn = document.getElementById('editCancelBtn');
  const editSaveBtn = document.getElementById('editSaveBtn');
  
  // 设置对话框元素
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsDialogOverlay = document.getElementById('settingsDialogOverlay');
  const compactModeCheckbox = document.getElementById('compactModeCheckbox');
  const showUrlCheckbox = document.getElementById('showUrlCheckbox');
  const showDateCheckbox = document.getElementById('showDateCheckbox');
  const showTagsCheckbox = document.getElementById('showTagsCheckbox');
  const titleMaxCharsInput = document.getElementById('titleMaxCharsInput');
  const urlMaxCharsInput = document.getElementById('urlMaxCharsInput');
  const settingsCancelBtn = document.getElementById('settingsCancelBtn');
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  const linkCountSpan = document.getElementById('linkCountSpan');
  const groupCountSpan = document.getElementById('groupCountSpan');
  const archivedCountSpan = document.getElementById('archivedCountSpan');
  const viewArchivedBtn = document.getElementById('viewArchivedBtn');
  const archivedView = document.getElementById('archivedView');
  const archivedContainer = document.getElementById('archivedContainer');
  const backFromArchivedBtn = document.getElementById('backFromArchivedBtn');

  // 状态管理
  let isDebugMode = false;
  let loadedLinks = [];
  let currentEditingLink = null; // 当前正在编辑的链接
  let updateSearchFn = null; // 搜索更新函数
  let currentSettings = null; // 当前设置
  
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
  
  // 加载存储的链接
  async function loadLinksFromStorage() {
    console.log('[loadLinksFromStorage] 开始加载数据');
    showStatusMessage('正在加载数据...');
    logMessage('开始加载链接数据');
    
    try {
      console.log('[loadLinksFromStorage] 调用 loadLinks()...');
      // 从 IndexedDB 加载数据
      loadedLinks = await loadLinks();
      console.log('[loadLinksFromStorage] loadLinks() 返回，数据条数:', loadedLinks?.length);
      
      // 确保 loadedLinks 是数组
      if (!Array.isArray(loadedLinks)) {
        console.error('[loadLinksFromStorage] loadedLinks 不是数组:', loadedLinks);
        loadedLinks = [];
      }
      
      if (isDebugMode) {
        logMessage(`获取到 ${loadedLinks.length} 条链接数据`);
      }
      
      if (loadedLinks.length === 0) {
        console.log('[loadLinksFromStorage] 没有数据，显示空状态');
        // 显示空状态
        showEmptyState(linksContainer);
        showStatusMessage('没有保存的链接');
        return;
      }
      
      try {
        console.log('[loadLinksFromStorage] 开始渲染链接...');
        // 渲染链接
        renderLinksList(loadedLinks);
        console.log('[loadLinksFromStorage] 渲染完成');
        
        // 设置搜索功能（首次加载或更新搜索数据源）
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
          // 更新搜索数据源
          updateSearchFn(loadedLinks);
        }
        
        console.log('[loadLinksFromStorage] 加载完成');
      } catch (error) {
        console.error('[loadLinksFromStorage] 渲染链接时出错:', error.name, error.message, error.stack);
        logMessage(`渲染链接时出错: ${error.message}`);
        showStatusMessage('显示链接时出错: ' + error.message, true);
        // 即使渲染出错，也显示空状态
        showEmptyState(linksContainer);
      }
    } catch (error) {
      console.error('[loadLinksFromStorage] 加载数据错误:', error.name, error.message, error.stack);
      const errorMsg = error.message || '未知错误';
      logMessage('加载数据错误: ' + errorMsg);
      showStatusMessage('加载失败: ' + errorMsg, true);
      // 即使加载出错，也显示空状态，避免界面卡住
      showEmptyState(linksContainer);
      loadedLinks = []; // 重置为空数组
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
          // 刷新列表
          await loadLinksFromStorage();
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

  // 处理搜索结果
  function handleSearchResults(filteredLinks, searchText) {
    if (filteredLinks.length === 0 && searchText) {
      // 显示搜索空状态
      showSearchEmptyState(linksContainer, searchText);
    } else {
      // 渲染过滤后的链接
      renderLinksList(filteredLinks);
    }
    
    // 更新状态消息
    if (searchText) {
      showStatusMessage(`找到 ${filteredLinks.length} 条匹配的链接`);
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
        
        // 重新加载链接（会自动更新搜索状态）
        await loadLinksFromStorage();
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
    editDialogOverlay.classList.add('show');
    editTitleInput.focus();
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
      
      const isPinned = link.pinned || false;
      showStatusMessage(isPinned ? '已取消置顶' : '已置顶');
      logMessage(`${isPinned ? '取消置顶' : '置顶'}链接: ${link.title || '无标题'}`);
      
      // 重新加载链接列表
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
    
    try {
      if (currentEditingLink && currentEditingLink.id) {
        // 编辑模式：更新链接
        await updateLink(currentEditingLink.id, {
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
        
        await addLink(newLink);
        
        showStatusMessage('链接已添加');
        logMessage(`添加链接: ${title}`);
      }
      
      // 隐藏对话框
      hideEditDialog();
      
      // 重新加载链接
      await loadLinksFromStorage();
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      const action = currentEditingLink && currentEditingLink.id ? '更新' : '添加';
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
  
  // ESC 键关闭对话框或整个弹窗
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (editDialogOverlay.classList.contains('show')) {
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

      // 更新显示
      if (linkCountSpan) linkCountSpan.textContent = linkCount;
      if (groupCountSpan) groupCountSpan.textContent = groupCount;
      if (archivedCountSpan) archivedCountSpan.textContent = archivedCount;
    } catch (error) {
      console.error('加载统计信息失败:', error);
      if (linkCountSpan) linkCountSpan.textContent = '-';
      if (groupCountSpan) groupCountSpan.textContent = '-';
      if (archivedCountSpan) archivedCountSpan.textContent = '-';
    }
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
      
      // 更新设置
      const updatedSettings = await updateCompactModeSettings({
        enabled: compactModeEnabled,
        showUrl: showUrl,
        showDate: showDate,
        showTags: showTags,
        titleMaxChars: titleMaxChars,
        urlMaxChars: urlMaxChars
      });
      
      currentSettings = updatedSettings;
      
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

  // 绑定分组管理按钮事件
  const groupsBtn = document.getElementById('groupsBtn');
  groupsBtn.addEventListener('click', function() {
    window.location.href = 'group.html';
  });

  // 选中文本按钮
  const selectionsBtn = document.getElementById('selectionsBtn');
  selectionsBtn.addEventListener('click', () => {
    // 使用内部导航加载 selections 页面（保持与 group.html 一致的 in-popup 行为）
    window.location.href = 'selections.html';
  });

  // 绑定设置对话框事件
  settingsBtn.addEventListener('click', showSettingsDialog);
  settingsCancelBtn.addEventListener('click', hideSettingsDialog);
  settingsSaveBtn.addEventListener('click', saveSettingsAndApply);

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
  loadAndApplySettings().then(() => {
    console.log('[popup] 设置加载完成，开始加载链接');
    loadLinksFromStorage();
    // 检查并显示快捷键配置提示
    checkAndShowShortcutTip();
  }).catch(error => {
    console.error('[popup] 初始加载失败:', error);
  });
  
  // 测试 Service Worker 是否运行
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[popup] Service Worker 可能未运行:', chrome.runtime.lastError.message);
    } else {
      console.log('[popup] Service Worker 响应:', response);
    }
  });
}); 
