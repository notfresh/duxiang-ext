// 导入存储模块
import { addLink, loadGroups, addLinkToGroup, addGroup } from './js/storage.js';

/** HTML 转义 */
function escapeHtml(text) {
    const div = document.createElement('div');
    return (div.textContent = text, div.innerHTML);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('页面已加载');

    const titleInput = document.getElementById('titleInput');
    const urlInput = document.getElementById('urlInput');
    const tagsInput = document.getElementById('tagsInput');
    const saveButton = document.getElementById('saveButton');
    const newGroupBtn = document.getElementById('newGroupBtn');
    const groupSelectContainer = document.getElementById('groupSelectContainer');
    const groupDialogOverlay = document.getElementById('groupDialogOverlay');
    const newGroupNameInput = document.getElementById('newGroupNameInput');
    const groupCancelBtn = document.getElementById('groupCancelBtn');
    const groupSaveBtn = document.getElementById('groupSaveBtn');

    if (!titleInput || !urlInput || !tagsInput || !saveButton) {
        console.error('无法找到必要的DOM元素');
        return;
    }

    console.log('所有DOM元素已获取');

    // ========== 分组选择 ==========

    /** 加载并渲染分组复选框 */
    async function loadAndRenderGroups() {
        const groups = await loadGroups();
        groupSelectContainer.innerHTML = '';
        if (!groups || groups.length === 0) {
            groupSelectContainer.innerHTML = '<span style="font-size:12px;color:#999;">暂无分组</span>';
            return;
        }
        for (const g of groups) {
            const div = document.createElement('div');
            div.className = 'group-checkbox-item';
            div.innerHTML = `<input type="checkbox" id="gcb_${g.groupId}" value="${g.groupId}"><label for="gcb_${g.groupId}">${escapeHtml(g.groupName)}</label>`;
            groupSelectContainer.appendChild(div);
        }
    }

    /** 将新链接添加到所有选中的分组 */
    async function addSelectedGroups(linkId) {
        const checkboxes = groupSelectContainer.querySelectorAll('input[type="checkbox"]:checked');
        if (!checkboxes.length) return;
        for (const cb of checkboxes) {
            try {
                await addLinkToGroup(cb.value, linkId);
            } catch (e) {
                console.error('[input] 添加链接到分组失败:', e);
            }
        }
    }

    // 新建分组弹窗事件
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
                alert('请输入分组名称');
                return;
            }
            try {
                const groupId = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                await addGroup({ groupId, groupName: name, order: 0, linkIds: [] });
                groupDialogOverlay.classList.remove('show');
                // 重新加载分组列表并自动选中
                await loadAndRenderGroups();
                const cb = document.getElementById('gcb_' + groupId);
                if (cb) cb.checked = true;
            } catch (e) {
                console.error('[input] 创建分组失败:', e);
                alert('创建分组失败');
            }
        });
    }

    if (groupDialogOverlay) {
        groupDialogOverlay.addEventListener('click', (e) => {
            if (e.target === groupDialogOverlay) {
                groupDialogOverlay.classList.remove('show');
            }
        });
    }

    if (newGroupNameInput) {
        newGroupNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                groupSaveBtn.click();
            }
        });
    }

    // 初始化加载分组
    loadAndRenderGroups();

    // ========== 从URL参数中获取标题和链接 ==========

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
    const handleSave = async () => {
        console.log('保存按钮被点击');
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const tags = tagsInput.value.trim();

        console.log('收集的表单数据:', { title, url, tags });

        if (title && url) {
            try {
                const newLink = {
                    title: title,
                    url: url,
                    tags: tags,
                    timestamp: new Date().toISOString()
                };

                const linkId = await addLink(newLink);
                console.log('保存成功，ID:', linkId);

                // 关联分组
                await addSelectedGroups(linkId);
                console.log('分组关联完成');

                window.close();
            } catch (error) {
                console.error('保存数据时发生错误:', error);
                const errorMessage = error.message || '未知错误';
                // 不关闭页面，让用户有机会查看错误
                alert('保存数据时出错: ' + errorMessage);
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
            handleSave();
        }
    });

    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    });

    tagsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    });

    // 按ESC键关闭窗口（优先关闭新建分组弹窗）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (groupDialogOverlay && groupDialogOverlay.classList.contains('show')) {
                groupDialogOverlay.classList.remove('show');
            } else {
                window.close();
            }
        }
    });

    // 自动聚焦到标题输入框
    titleInput.focus();
    console.log('初始化完成，焦点设置在标题输入框');
});
