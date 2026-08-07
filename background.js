// Service Worker 启动日志
console.log('[background] ========== Service Worker 已启动 ==========');
console.log('[background] 时间:', new Date().toISOString());
console.log('[background] 扩展 ID:', chrome.runtime.id);

// 静态导入 simple-sync 模块
// ========== 轻量级同步模块（内联）==========
// 使用 SHA-256 计算 hash
async function computeSHA256(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeHash(url, title) {
  const content = (title || '') + '::' + (url || '');
  return await computeSHA256(content);
}

// 同步核心逻辑
async function doSimpleSync(peerUrl) {
  // 从 storage 获取所有链接
  const db = await new Promise((resolve) => {
    const request = indexedDB.open('readingLinks', 3);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { throw new Error('DB open failed'); };
  });

  const links = await new Promise((resolve, reject) => {
    const tx = db.transaction('links', 'readonly');
    const store = tx.objectStore('links');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // 发送到服务器
  const linksWithHash = await Promise.all(
    links.map(async link => ({
      title: link.title,
      url: link.url,
      hash: await computeHash(link.url, link.title)
    }))
  );

  const apiUrl = `${peerUrl.replace(/\/$/, '')}/api/sync`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ links: linksWithHash })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const serverLinks = data.links || [];

  // 检查并创建本地不存在的链接
  const localHashes = await Promise.all(links.map(l => computeHash(l.url, l.title)));
  const localHashSet = new Set(localHashes);

  let createdCount = 0;
  for (const link of serverLinks) {
    const hash = await computeHash(link.url, link.title);
    if (!localHashSet.has(hash)) {
      // 创建新链接
      await new Promise((resolve, reject) => {
        const tx = db.transaction('links', 'readwrite');
        const store = tx.objectStore('links');
        store.add({ title: link.title, url: link.url, timestamp: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      createdCount++;
    }
  }

  return { success: true, message: `同步成功，已创建 ${createdCount} 个新链接`, createdCount };
}

// initialize sync runtime and mount router (non-blocking)
try {
    import('./js/sync/bootstrap.js').then(async (mod) => {
        try {
            await mod.createSyncRuntime();
            const router = await import('./js/sync/infra/sync-router.js');
            router.mountSyncRouter();
            console.log('[background] sync runtime initialized and router mounted');
        } catch (e) {
            console.warn('[background] failed to initialize sync runtime/router', e);
        }
    });
} catch (e) {
    console.warn('[background] dynamic import failed for sync bootstrap', e);
}

// 弹窗尺寸常量
const POPUP_WIDTH = 400;
const POPUP_HEIGHT = 600;

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[background] 扩展安装/更新:', details.reason);
  // 创建右键菜单
  createContextMenus();
});

// 监听启动事件
chrome.runtime.onStartup.addListener(() => {
  console.log('[background] 扩展启动');
});

// 监听来自 popup 的消息（用于测试 Service Worker 是否运行）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[background] 收到消息:', message);
  if (message.type === 'ping') {
    sendResponse({ status: 'pong', time: new Date().toISOString() });
    return true; // 保持消息通道开放以支持异步响应
  }

  // 同步拉取
  if (message.type === 'sync.pull') {
    (async () => {
      try {
        const { createSyncRuntime, getRuntime } = await import('./js/sync/bootstrap.js');
        await createSyncRuntime({ baseUrlForPeer: (p) => p });
        const runtime = getRuntime();
        if (!runtime || !runtime.client) {
          sendResponse({ success: false, reason: 'sync runtime not ready' });
          return;
        }
        const res = await runtime.client.pull(message.peerId, message.entityType);
        sendResponse(res);
      } catch (e) {
        console.error('[background] sync.pull error', e);
        sendResponse({ success: false, reason: e.message });
      }
    })();
    return true;
  }

  // 同步推送
  if (message.type === 'sync.push') {
    (async () => {
      try {
        const { createSyncRuntime, getRuntime } = await import('./js/sync/bootstrap.js');
        await createSyncRuntime({ baseUrlForPeer: (p) => p });
        const runtime = getRuntime();
        if (!runtime || !runtime.client) {
          sendResponse({ success: false, reason: 'sync runtime not ready' });
          return;
        }
        const res = await runtime.client.push(message.peerId, message.entityType);
        sendResponse(res);
      } catch (e) {
        console.error('[background] sync.push error', e);
        sendResponse({ success: false, reason: e.message });
      }
    })();
    return true;
  }

  // 轻量级双向同步
  if (message.type === 'simple-sync') {
    (async () => {
      try {
        const { loadSettings } = await import('./js/settings.js');
        const userSettings = await loadSettings();
        const peerUrl = userSettings.syncPeerUrl;

        if (!peerUrl) {
          sendResponse({ success: false, message: '请先配置服务器地址' });
          return;
        }

        const result = await doSimpleSync(peerUrl);
        sendResponse(result);
      } catch (e) {
        console.error('[background] simple-sync error', e);
        sendResponse({ success: false, message: e.message });
      }
    })();
    return true;
  }

  // 轻量级拉取
  if (message.type === 'simple-pull') {
    (async () => {
      try {
        const { loadSettings } = await import('./js/settings.js');
        const userSettings = await loadSettings();
        const peerUrl = userSettings.syncPeerUrl;

        if (!peerUrl) {
          sendResponse({ success: false, message: '请先配置服务器地址' });
          return;
        }

        const result = await simplePull(peerUrl);
        sendResponse(result);
      } catch (e) {
        console.error('[background] simple-pull error', e);
        sendResponse({ success: false, message: e.message });
      }
    })();
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
    console.log('[background] 收到命令:', command);
    if (command === 'save_reading_url') {
        console.log('[background] 开始处理保存阅读链接命令');
        // 获取当前活动标签页信息
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('[background] 查询标签页失败:', chrome.runtime.lastError);
                return;
            }

            if (tabs.length === 0) {
                console.error('[background] 无法获取当前标签页信息');
                return;
            }

            const currentTab = tabs[0];
            console.log('[background] 当前标签页:', currentTab.url, currentTab.title);
            const url = encodeURIComponent(currentTab.url);
            const title = encodeURIComponent(currentTab.title);

            chrome.windows.getCurrent((currentWindow) => {
                if (chrome.runtime.lastError) {
                    console.error('[background] 获取当前窗口失败:', chrome.runtime.lastError);
                    return;
                }

                const popupWidth = POPUP_WIDTH;
                const popupHeight = POPUP_HEIGHT;

                const left = Math.round(currentWindow.left + (currentWindow.width - popupWidth) / 2);
                const top = Math.round(currentWindow.top + (currentWindow.height - popupHeight) / 2);

                console.log('[background] 创建输入窗口，位置:', left, top);
                chrome.windows.create({
                    url: `input.html?url=${url}&title=${title}`,
                    type: 'popup',
                    width: popupWidth,
                    height: popupHeight,
                    left: left,
                    top: top
                }, (window) => {
                    if (chrome.runtime.lastError) {
                        console.error('[background] 创建窗口失败:', chrome.runtime.lastError);
                    } else {
                        console.log('[background] 保存阅读链接窗口已创建，窗口ID:', window.id);
                    }
                });
            });
        });
    } else if (command === 'open_groups') {
        console.log('[background] 开始处理打开分组管理命令');
        // 快捷键打开的弹窗有标题栏，高度需要增加
        chrome.windows.create({
            url: 'group.html?from=shortcut',
            type: 'popup',
            width: POPUP_WIDTH,
            height: POPUP_HEIGHT + 50
        }, (window) => {
            if (chrome.runtime.lastError) {
                console.error('[background] 创建分组管理弹窗失败:', chrome.runtime.lastError);
            } else {
                console.log('[background] 分组管理弹窗已创建，窗口ID:', window.id);
            }
        });
    } else if (command === 'open_selections') {
        console.log('[background] 开始处理打开选中文本命令');
        // 快捷键打开的弹窗有标题栏，高度需要增加
        chrome.windows.create({
            url: 'selections.html?from=shortcut',
            type: 'popup',
            width: POPUP_WIDTH,
            height: POPUP_HEIGHT + 50
        }, (window) => {
            if (chrome.runtime.lastError) {
                console.error('[background] 创建选中文本弹窗失败:', chrome.runtime.lastError);
            } else {
                console.log('[background] 选中文本弹窗已创建，窗口ID:', window.id);
            }
        });
    } else if (command === 'save_selection') {
        console.log('[background] 开始处理保存选中文本命令');
        handleSaveSelection();
    }
});

// ==================== 保存选中文本功能 ====================

const DB_NAME = 'readingLinks';
const DB_VERSION = 3;
const SELECTIONS_STORE_NAME = 'selections';

/**
 * 处理保存选中文本
 */
async function handleSaveSelection() {
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (chrome.runtime.lastError) {
            console.error('[background] 查询标签页失败:', chrome.runtime.lastError);
            showNotification('保存失败：无法获取页面信息');
            return;
        }

        if (tabs.length === 0) {
            console.error('[background] 无法获取当前标签页信息');
            showNotification('保存失败：当前无活动标签页');
            return;
        }

        const currentTab = tabs[0];
        const pageUrl = currentTab.url;
        const pageTitle = currentTab.title;

        console.log('[background] 当前标签页:', pageUrl, pageTitle);

        // 检查URL是否有效
        if (!pageUrl || !pageUrl.startsWith('http')) {
            console.error('[background] 无效的页面URL:', pageUrl);
            showNotification('保存失败：无法保存此页面');
            return;
        }

        // 注入脚本获取选中的文本和DOM信息
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: currentTab.id },
                func: () => {
                    const selection = window.getSelection();
                    const text = selection ? selection.toString().trim() : '';
                    
                    if (!text) {
                        return { text: '', html: '', contextTag: '' };
                    }

                    let contextTag = '';
                    let html = '';
                    
                    // 获取选中范围的第一个节点
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const commonAncestor = range.commonAncestorContainer;
                        
                        // 获取最近的块级元素或文本所在的元素
                        let element = commonAncestor.nodeType === Node.TEXT_NODE 
                            ? commonAncestor.parentElement 
                            : commonAncestor;
                        
                        // 向上查找，找到更有意义的块级元素
                        let depth = 0;
                        while (element && depth < 3) {
                            const tagName = element.tagName.toLowerCase();
                            if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'article', 'section'].includes(tagName)) {
                                contextTag = tagName;
                                break;
                            }
                            element = element.parentElement;
                            depth++;
                        }
                        
                        // 克隆范围以获取HTML
                        try {
                            const fragment = range.cloneContents();
                            const tempDiv = document.createElement('div');
                            tempDiv.appendChild(fragment.cloneNode(true));
                            html = tempDiv.innerHTML;
                        } catch (e) {
                            html = '';
                        }
                    }
                    
                    return { text, html, contextTag };
                }
            });

            if (chrome.runtime.lastError) {
                console.error('[background] 注入脚本失败:', chrome.runtime.lastError);
                showNotification('保存失败：无法获取选中文本');
                return;
            }

            const selectionData = results[0]?.result;
            const selectedText = selectionData?.text;

            if (!selectedText || selectedText.length === 0) {
                console.log('[background] 没有选中的文本');
                showNotification('请先选中要保存的文本');
                return;
            }

            console.log('[background] 选中的文本:', selectedText.substring(0, 50) + '...');
            console.log('[background] DOM信息 - 标签:', selectionData.contextTag, ', HTML长度:', selectionData.html?.length || 0);

            // 保存到 IndexedDB
            await saveSelectionToDB(pageUrl, pageTitle, selectedText, selectionData.html, selectionData.contextTag);

            console.log('[background] 选中文本保存成功');
            showNotification('已保存选中文本');

        } catch (error) {
            console.error('[background] 保存选中文本失败:', error);
            showNotification('保存失败：' + error.message);
        }
    });
}

/**
 * 保存选中文本到 IndexedDB
 */
async function saveSelectionToDB(url, title, text, html = '', contextTag = '') {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[background] 打开数据库失败:', request.error);
            reject(request.error);
        };

        // 确保 store 存在
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            console.log('[background] 数据库升级中，当前版本:', db.version);
            // 创建 selections store（如果不存在）
            if (!db.objectStoreNames.contains(SELECTIONS_STORE_NAME)) {
                console.log('[background] 创建 selections 对象存储');
                db.createObjectStore(SELECTIONS_STORE_NAME, { keyPath: 'url' });
            }
        };

        request.onsuccess = async (event) => {
            const db = event.target.result;

            // 再次检查 store 是否存在（可能在本次打开中创建）
            if (!db.objectStoreNames.contains(SELECTIONS_STORE_NAME)) {
                console.error('[background] selections store 不存在');
                reject(new Error('存储不存在'));
                return;
            }

            const store = db.transaction([SELECTIONS_STORE_NAME], 'readwrite')
                .objectStore(SELECTIONS_STORE_NAME);

            // 先获取现有数据
            const getRequest = store.get(url);

            getRequest.onsuccess = () => {
                const existing = getRequest.result;
                const newSelection = {
                    text: text,
                    html: html || '',
                    contextTag: contextTag || '',
                    time: new Date().toISOString()
                };

                if (existing && existing.selections) {
                    existing.selections.push(newSelection);
                    const updateRequest = store.put(existing);
                    updateRequest.onsuccess = () => {
                        console.log('[background] 已追加选中文本，当前共有', existing.selections.length, '条');
                        resolve();
                    };
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    const newRecord = {
                        url: url,
                        title: title || '',
                        selections: [newSelection]
                    };
                    const addRequest = store.add(newRecord);
                    addRequest.onsuccess = () => {
                        console.log('[background] 已保存第一条选中文本');
                        resolve();
                    };
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            // 创建 selections store
            if (!db.objectStoreNames.contains(SELECTIONS_STORE_NAME)) {
                console.log('[background] 创建 selections 对象存储');
                db.createObjectStore(SELECTIONS_STORE_NAME, { keyPath: 'url' });
            }
        };
    });
}

/**
 * 显示通知
 */
function showNotification(message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/octpus_blue_48.png',
        title: '读享收藏夹',
        message: message
    }, (notificationId) => {
        if (chrome.runtime.lastError) {
            console.warn('[background] 显示通知失败:', chrome.runtime.lastError);
        } else {
            // 3秒后自动关闭通知
            setTimeout(() => {
                chrome.notifications.clear(notificationId);
            }, 3000);
        }
    });
}

// ==================== 右键菜单功能 ====================

/**
 * 创建右键菜单
 */
function createContextMenus() {
    // 创建"保存选中文本到读享"右键菜单
    chrome.contextMenus.create({
        id: 'save-selection-to-duxiang',
        title: '保存文本到读享',
        contexts: ['selection']  // 仅在选中文本时显示
    });
    console.log('[background] 右键菜单已创建');
}

/**
 * 处理右键菜单点击事件
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'save-selection-to-duxiang') {
        console.log('[background] 右键菜单点击：保存选中文本到读享');
        console.log('[background] 选中的文本:', info.selectionText);

        if (!info.selectionText || !info.selectionText.trim()) {
            showNotification('没有选中的文本');
            return;
        }

        if (!tab || !tab.url || !tab.url.startsWith('http')) {
            showNotification('无法保存此页面');
            return;
        }

        try {
            // 注入脚本获取DOM信息
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const selection = window.getSelection();
                    let contextTag = '';
                    let html = '';
                    
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        const commonAncestor = range.commonAncestorContainer;
                        
                        // 获取最近的块级元素或文本所在的元素
                        let element = commonAncestor.nodeType === Node.TEXT_NODE 
                            ? commonAncestor.parentElement 
                            : commonAncestor;
                        
                        // 向上查找，找到更有意义的块级元素
                        let depth = 0;
                        while (element && depth < 3) {
                            const tagName = element.tagName.toLowerCase();
                            if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'div', 'article', 'section'].includes(tagName)) {
                                contextTag = tagName;
                                break;
                            }
                            element = element.parentElement;
                            depth++;
                        }
                        
                        // 克隆范围以获取HTML
                        try {
                            const fragment = range.cloneContents();
                            const tempDiv = document.createElement('div');
                            tempDiv.appendChild(fragment.cloneNode(true));
                            html = tempDiv.innerHTML;
                        } catch (e) {
                            html = '';
                        }
                    }
                    
                    return { contextTag, html };
                }
            });

            const domInfo = results[0]?.result || { contextTag: '', html: '' };
            
            await saveSelectionToDB(tab.url, tab.title, info.selectionText.trim(), domInfo.html, domInfo.contextTag);
            showNotification('已保存选中文本');
        } catch (error) {
            console.error('[background] 保存选中文本失败:', error);
            showNotification('保存失败：' + error.message);
        }
    }
});