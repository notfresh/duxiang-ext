// 导入存储模块
import { addLink, loadGroups, addLinkToGroup, removeLinkFromGroup, addGroup, getLinkByUrl, updateLink } from './js/storage.js';

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

    // Textarea 自适应高度
    function autoResizeTextarea(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }
    [titleInput, urlInput].forEach(el => {
        el.addEventListener('input', () => autoResizeTextarea(el));
    });

    // ========== 分组选择 ==========

    /** 加载并渲染分组复选框，可选传入 linkId 预勾选 */
    async function loadAndRenderGroups(linkId) {
        const groups = await loadGroups();
        groupSelectContainer.innerHTML = '';
        if (!groups || groups.length === 0) {
            groupSelectContainer.innerHTML = '<span style="font-size:12px;color:#999;">暂无分组</span>';
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
            div.innerHTML = `<input type="checkbox" id="gcb_${g.groupId}" value="${g.groupId}" ${isChecked ? 'checked' : ''}><label for="gcb_${g.groupId}">${escapeHtml(g.groupName)}</label>`;
            groupSelectContainer.appendChild(div);
        }
    }

    /** 双向同步链接与分组的关联关系（用于编辑已有链接时） */
    async function syncLinkGroups(linkId) {
        const checkboxes = groupSelectContainer.querySelectorAll('input[type="checkbox"]');
        const selected = new Set();
        for (const cb of checkboxes) {
            if (cb.checked) selected.add(cb.value);
        }

        // 收集所有现有分组 ID
        const groups = await loadGroups();
        const groupIds = new Set(groups.map(g => g.groupId));

        // 从已取消勾选的分组中移除
        for (const groupId of groupIds) {
            if (!selected.has(groupId)) {
                try {
                    await removeLinkFromGroup(groupId, linkId);
                } catch (e) { /* ignore */ }
            }
        }

        // 添加到新勾选的分组
        for (const groupId of selected) {
            try {
                await addLinkToGroup(groupId, linkId);
            } catch (e) { /* ignore */ }
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
    let existingLinkId = null; // 编辑模式下存储已有链接的 ID
    const handleSave = async () => {
        console.log('保存按钮被点击');
        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const tags = tagsInput.value.trim();

        console.log('收集的表单数据:', { title, url, tags });

        if (!title || !url) {
            console.error('标题和链接不能为空');
            alert('请填写标题和链接');
            return;
        }

        try {
            if (existingLinkId != null) {
                // 编辑模式：更新已有链接，双向同步分组
                await updateLink(existingLinkId, { title, url, tags });
                console.log('已更新链接，ID:', existingLinkId);

                await syncLinkGroups(existingLinkId);
                console.log('分组关联完成');

                window.close();
            } else {
                // 检查 URL 是否已存在
                const dupLink = await getLinkByUrl(url);

                if (dupLink) {
                    // URL 重复 → 切换为编辑模式
                    existingLinkId = dupLink.id;
                    titleInput.value = dupLink.title || '';
                    urlInput.value = dupLink.url || '';
                    tagsInput.value = dupLink.tags || '';
                    document.querySelector('h1').textContent = '编辑已有链接';
                    autoResizeTextarea(titleInput);
                    autoResizeTextarea(urlInput);

                    // 重新渲染分组列表并预勾选旧分组
                    await loadAndRenderGroups(dupLink.id);

                    console.log('检测到重复 URL，切换为编辑模式，ID:', existingLinkId);
                    alert(`已找到同 URL 的已有链接（ID: ${dupLink.id}）\n\n下方已预填原记录，请确认后保存。`);
                    return;
                }

                // 新增模式
                const newLink = {
                    title: title,
                    url: url,
                    tags: tags,
                    timestamp: new Date().toISOString()
                };

                const linkId = await addLink(newLink);
                console.log('保存成功，ID:', linkId);

                await addSelectedGroups(linkId);
                console.log('分组关联完成');

                window.close();
            }
        } catch (error) {
            console.error('保存数据时发生错误:', error);
            const errorMessage = error.message || '未知错误';
            alert('保存数据时出错: ' + errorMessage);
        }
    };

    // 绑定保存按钮点击事件
    console.log('正在绑定保存按钮点击事件');
    saveButton.addEventListener('click', handleSave);
    console.log('保存按钮点击事件已绑定');

    // Textarea: 用 keydown 拦截回车直接保存，不插入换行符
    function preventEnterSave(el) {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSave();
            }
        });
    }
    preventEnterSave(titleInput);
    preventEnterSave(urlInput);

    tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
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
