document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const linksContainer = document.getElementById('linksContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const exportBtn = document.getElementById('exportBtn');
  const debugBtn = document.getElementById('debugBtn');
  const statusMessage = document.getElementById('statusMessage');
  const debugPanel = document.getElementById('debugPanel');
  
  // 状态管理
  let isDebugMode = false;
  let loadedLinks = [];
  
  // 显示状态消息
  function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    
    if (isError) {
      statusMessage.classList.add('error-message');
    } else {
      statusMessage.classList.remove('error-message');
    }
    
    // 自动隐藏（非错误消息）
    if (!isError) {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, 3000);
    }
  }
  
  // 添加日志函数
  function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    debugPanel.textContent += `\n[${timestamp}] ${message}`;
    debugPanel.scrollTop = debugPanel.scrollHeight;
    console.log(message);
  }
  
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
  function testStorage() {
    if (typeof chrome === 'undefined' || typeof chrome.storage === 'undefined') {
      log('错误: chrome.storage API 不可用');
      return;
    }
    
    log('检查存储状态...');
    
    chrome.storage.local.get(null, function(allData) {
      if (chrome.runtime.lastError) {
        log('存储访问错误: ' + chrome.runtime.lastError.message);
        return;
      }
      
      const keys = Object.keys(allData);
      log(`存储中共有 ${keys.length} 个键: ${keys.join(', ')}`);
      
      keys.forEach(key => {
        const value = allData[key];
        if (Array.isArray(value)) {
          log(`键 "${key}" 包含一个数组，长度为 ${value.length}`);
          if (value.length > 0) {
            log(`- 第一项: ${JSON.stringify(value[0]).substring(0, 100)}...`);
          }
        } else {
          log(`键 "${key}" 包含类型为 ${typeof value} 的数据`);
        }
      });
    });
  }
  
  // 加载存储的链接
  function loadLinks() {
    showStatus('正在加载数据...');
    log('开始加载链接数据');
    
    // 清空容器
    linksContainer.innerHTML = '';
    
    // 从存储加载数据
    chrome.storage.local.get(['readingLinks'], function(result) {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        log('加载数据错误: ' + errorMsg);
        showStatus('加载失败: ' + errorMsg, true);
        return;
      }
      
      // 获取链接数组
      loadedLinks = result.readingLinks || [];
      
      if (isDebugMode) {
        log(`获取到 ${loadedLinks.length} 条链接数据`);
      }
      
      if (!Array.isArray(loadedLinks) || loadedLinks.length === 0) {
        // 显示空状态
        linksContainer.innerHTML = `
          <div class="empty-state">
            <p>暂无保存的阅读链接</p>
            <p>使用快捷键 Shift+Alt+S 添加当前页面到阅读列表</p>
          </div>
        `;
        showStatus('没有保存的链接');
        return;
      }
      
      try {
        // 渲染链接
        loadedLinks.forEach((link, index) => {
          if (isDebugMode) {
            log(`渲染第 ${index+1} 条链接: ${link.title || '无标题'}`);
          }
          
          const linkCard = createLinkCard(link, index);
          linksContainer.appendChild(linkCard);
        });
        
        showStatus(`已加载 ${loadedLinks.length} 条链接`);
      } catch (error) {
        log(`渲染链接时出错: ${error.message}`);
        showStatus('显示链接时出错', true);
      }
    });
  }
  
  // 删除链接
  function deleteLink(index) {
    if (index < 0 || index >= loadedLinks.length) {
      showStatus('删除失败：无效的索引', true);
      return;
    }
    
    const deletedLink = loadedLinks[index];
    
    // 确认删除
    if (confirm(`确定要删除链接 "${deletedLink.title || '无标题'}" 吗？`)) {
      // 从数组中移除
      loadedLinks.splice(index, 1);
      
      // 更新存储
      chrome.storage.local.set({readingLinks: loadedLinks}, function() {
        if (chrome.runtime.lastError) {
          log('保存更新后的数据出错: ' + chrome.runtime.lastError.message);
          showStatus('删除失败', true);
          return;
        }
        
        showStatus('链接已删除');
        
        // 重新加载链接
        loadLinks();
      });
    }
  }
  
  // 创建链接卡片
  function createLinkCard(link, index) {
    const card = document.createElement('div');
    card.className = 'link-card';
    
    // 头部区域：标题和删除按钮
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    
    // 标题
    const title = document.createElement('div');
    title.className = 'link-title';
    title.textContent = link.title || '无标题';
    cardHeader.appendChild(title);
    
    // 删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '&times;'; // × 符号
    deleteBtn.title = '删除链接';
    deleteBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // 阻止事件冒泡
      deleteLink(index);
    });
    cardHeader.appendChild(deleteBtn);
    
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
    if (link.tags && link.tags.trim() !== '') {
      const tagArray = link.tags.split(',').map(t => t.trim()).filter(t => t);
      tagArray.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = tag;
        tags.appendChild(tagSpan);
      });
    }
    meta.appendChild(tags);
    
    // 时间戳
    if (link.timestamp) {
      const timestamp = document.createElement('div');
      timestamp.className = 'timestamp';
      const date = new Date(link.timestamp);
      timestamp.textContent = date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      meta.appendChild(timestamp);
    }
    
    card.appendChild(meta);
    
    // 添加点击事件
    urlLink.addEventListener('click', function(event) {
      // 不阻止默认行为，让链接在新标签页打开
      // 但记录点击
      if (isDebugMode) {
        log(`链接被点击: ${link.title}`);
      }
    });
    
    return card;
  }
  
  // 导出数据
  function exportData() {
    try {
      if (!loadedLinks || loadedLinks.length === 0) {
        showStatus('没有数据可以导出', true);
        return;
      }
      
      // 创建导出数据
      const exportData = JSON.stringify(loadedLinks, null, 2);
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
      
      showStatus('数据导出成功');
    } catch (error) {
      log(`导出数据时出错: ${error.message}`);
      showStatus('导出数据时出错', true);
    }
  }
  
  // 绑定按钮事件
  refreshBtn.addEventListener('click', loadLinks);
  exportBtn.addEventListener('click', exportData);
  debugBtn.addEventListener('click', toggleDebugMode);
  
  // 初始加载
  loadLinks();
}); 