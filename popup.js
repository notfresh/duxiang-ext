// 导入模块
import { showStatus, log } from './js/utils.js';
import { renderLinks, showEmptyState, showSearchEmptyState } from './js/render.js';
import { loadLinks, deleteLink as deleteLinkFromStorage, updateLink, exportLinks, batchAddLinks, togglePinLink } from './js/storage.js';
import { importBookmarks } from './js/bookmarks.js';
import { setupSearch } from './js/search.js';

document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const linksContainer = document.getElementById('linksContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const importBookmarksBtn = document.getElementById('importBookmarksBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const jsonFileInput = document.getElementById('jsonFileInput');
  const exportBtn = document.getElementById('exportBtn');
  const debugBtn = document.getElementById('debugBtn');
  const statusMessage = document.getElementById('statusMessage');
  const debugPanel = document.getElementById('debugPanel');
  
  // 搜索相关元素
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  
  // 编辑对话框元素
  const editDialogOverlay = document.getElementById('editDialogOverlay');
  const editTitleInput = document.getElementById('editTitleInput');
  const editUrlInput = document.getElementById('editUrlInput');
  const editTagsInput = document.getElementById('editTagsInput');
  const editCancelBtn = document.getElementById('editCancelBtn');
  const editSaveBtn = document.getElementById('editSaveBtn');
  
  // 状态管理
  let isDebugMode = false;
  let loadedLinks = [];
  let currentEditingLink = null; // 当前正在编辑的链接
  let updateSearchFn = null; // 搜索更新函数
  
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
    showStatusMessage('正在加载数据...');
    logMessage('开始加载链接数据');
    
    try {
      // 从 IndexedDB 加载数据
      loadedLinks = await loadLinks();
      
      if (isDebugMode) {
        logMessage(`获取到 ${loadedLinks.length} 条链接数据`);
      }
      
      if (!Array.isArray(loadedLinks) || loadedLinks.length === 0) {
        // 显示空状态
        showEmptyState(linksContainer);
        showStatusMessage('没有保存的链接');
        return;
      }
      
      try {
        // 渲染链接
        renderLinksList(loadedLinks);
        
        // 设置搜索功能（首次加载或更新搜索数据源）
        if (!updateSearchFn) {
          updateSearchFn = setupSearch(
            searchInput,
            clearSearchBtn,
            handleSearchResults,
            loadedLinks
          );
        } else {
          // 更新搜索数据源
          updateSearchFn(loadedLinks);
        }
        
        showStatusMessage(`已加载 ${loadedLinks.length} 条链接`);
      } catch (error) {
        logMessage(`渲染链接时出错: ${error.message}`);
        showStatusMessage('显示链接时出错', true);
      }
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('加载数据错误: ' + errorMsg);
      showStatusMessage('加载失败: ' + errorMsg, true);
    }
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
    editTitleInput.value = link.title || '';
    editUrlInput.value = link.url || '';
    editTagsInput.value = link.tags || '';
    editDialogOverlay.classList.add('show');
    editTitleInput.focus();
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
  
  // 保存编辑
  async function saveEdit() {
    if (!currentEditingLink) {
      return;
    }
    
    const title = editTitleInput.value.trim();
    const url = editUrlInput.value.trim();
    const tags = editTagsInput.value.trim();
    
    // 验证
    if (!title || !url) {
      showStatusMessage('标题和网址不能为空', true);
      return;
    }
    
    try {
      // 更新链接
      await updateLink(currentEditingLink.id, {
        title: title,
        url: url,
        tags: tags
      });
      
      showStatusMessage('链接已更新');
      logMessage(`更新链接: ${title}`);
      
      // 隐藏对话框
      hideEditDialog();
      
      // 重新加载链接
      await loadLinksFromStorage();
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('更新链接失败: ' + errorMsg);
      showStatusMessage('更新失败: ' + errorMsg, true);
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
  
  // ESC 键关闭对话框
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && editDialogOverlay.classList.contains('show')) {
      hideEditDialog();
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
      importBookmarksBtn.textContent = '导入收藏夹';
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
    importJsonBtn.disabled = true;
    importJsonBtn.textContent = '导入中...';
    
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
      const result = await batchAddLinks(validLinks);
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
      
      // 重新加载链接列表
      await loadLinksFromStorage();
      
    } catch (error) {
      const errorMsg = error.message || '未知错误';
      logMessage('导入 JSON 文件失败: ' + errorMsg);
      showStatusMessage('导入失败: ' + errorMsg, true);
    } finally {
      // 恢复按钮状态
      importJsonBtn.disabled = false;
      importJsonBtn.textContent = '导入 JSON';
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
  
  // 绑定按钮事件
  refreshBtn.addEventListener('click', loadLinksFromStorage);
  importBookmarksBtn.addEventListener('click', handleImportBookmarks);
  importJsonBtn.addEventListener('click', handleImportJson);
  exportBtn.addEventListener('click', exportData);
  debugBtn.addEventListener('click', toggleDebugMode);
  
  // 初始加载
  loadLinksFromStorage();
}); 
