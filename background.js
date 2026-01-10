// Service Worker 启动日志
console.log('[background] ========== Service Worker 已启动 ==========');
console.log('[background] 时间:', new Date().toISOString());
console.log('[background] 扩展 ID:', chrome.runtime.id);

// 监听安装事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[background] 扩展安装/更新:', details.reason);
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
                
                const popupWidth = 400;
                const popupHeight = 380; // 稍微增加高度以适应更多内容
                
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
    }
});