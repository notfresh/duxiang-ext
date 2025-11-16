chrome.commands.onCommand.addListener((command) => {
    if (command === 'save_reading_url') {
        // 获取当前活动标签页信息
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length === 0) {
                console.error('无法获取当前标签页信息');
                return;
            }
            
            const currentTab = tabs[0];
            const url = encodeURIComponent(currentTab.url);
            const title = encodeURIComponent(currentTab.title);
            
            chrome.windows.getCurrent((currentWindow) => {
                const popupWidth = 400;
                const popupHeight = 380; // 稍微增加高度以适应更多内容
                
                const left = Math.round(currentWindow.left + (currentWindow.width - popupWidth) / 2);
                const top = Math.round(currentWindow.top + (currentWindow.height - popupHeight) / 2);

                chrome.windows.create({
                    url: `input.html?url=${url}&title=${title}`,
                    type: 'popup',
                    width: popupWidth,
                    height: popupHeight,
                    left: left,
                    top: top
                }, (window) => {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                    } else {
                        console.log('保存阅读链接窗口已创建');
                    }
                });
            });
        });
    }
});