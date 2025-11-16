document.addEventListener('DOMContentLoaded', () => {
    console.log('页面已加载');
    
    const titleInput = document.getElementById('titleInput');
    const urlInput = document.getElementById('urlInput');
    const tagsInput = document.getElementById('tagsInput');
    const saveButton = document.getElementById('saveButton');
    
    if (!titleInput || !urlInput || !tagsInput || !saveButton) {
        console.error('无法找到必要的DOM元素');
        return;
    }
    
    console.log('所有DOM元素已获取');

    // 从URL参数中获取标题和链接
    const urlParams = new URLSearchParams(window.location.search);
    const pageTitle = urlParams.get('title');
    const pageUrl = urlParams.get('url');
    console.log('URL参数:', { pageTitle, pageUrl });

    // 填充输入框
    if (pageTitle) {
        titleInput.value = decodeURIComponent(pageTitle);
    }
    
    if (pageUrl) {
        urlInput.value = decodeURIComponent(pageUrl);
    }

    // 保存按钮点击事件
    const handleSave = () => {
        console.log('保存按钮被点击');
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const tags = tagsInput.value.trim();
        
        console.log('收集的表单数据:', { title, url, tags });

        if (title && url) {
            // 打印收集到的数据到控制台
            console.log('保存的阅读链接数据：', {
                标题: title,
                链接: url,
                标签: tags
            });
            
            try {
                // 创建新的链接对象
                const newLink = {
                    title: title,
                    url: url,
                    tags: tags,
                    timestamp: new Date().toISOString() // 添加时间戳便于排序
                };
                
                // 从chrome.storage获取现有链接
                chrome.storage.local.get(['readingLinks'], function(result) {
                    let savedLinks = result.readingLinks || [];
                    
                    // 确保savedLinks是数组
                    if (!Array.isArray(savedLinks)) {
                        console.log('现有数据不是数组，创建新数组');
                        savedLinks = [];
                    }
                    
                    console.log('读取到现有的链接数据，共', savedLinks.length, '条');
                    
                    // 添加到数组开头（最新的在前面）
                    savedLinks.unshift(newLink);
                    console.log('添加新链接后，现在共有', savedLinks.length, '条数据');
                    
                    // 保存更新后的数组
                    chrome.storage.local.set({readingLinks: savedLinks}, function() {
                        console.log('保存成功');
                        
                        // 关闭窗口
                        console.log('即将关闭窗口');
                        window.close();
                    });
                });
            } catch (error) {
                console.error('保存数据时发生错误:', error);
                alert('保存数据时出错: ' + error.message);
            }
        } else {
            console.error('标题和链接不能为空');
            alert('请填写标题和链接');
        }
    };

    // 绑定保存按钮点击事件
    console.log('正在绑定保存按钮点击事件');
    saveButton.addEventListener('click', handleSave);
    console.log('保存按钮点击事件已绑定');

    // 按回车键时保存
    titleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            console.log('在标题输入框按下Enter键');
            handleSave();
        }
    });
    
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            console.log('在URL输入框按下Enter键');
            handleSave();
        }
    });
    
    tagsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            console.log('在标签输入框按下Enter键');
            handleSave();
        }
    });

    // 按ESC键关闭窗口
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            console.log('按下ESC键，关闭窗口');
            window.close();
        }
    });

    // 自动聚焦到标题输入框
    titleInput.focus();
    console.log('初始化完成，焦点设置在标题输入框');
}); 