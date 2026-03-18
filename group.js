/**
 * 分组管理页面逻辑
 */
import {
  loadGroups,
  addGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  reorderGroupLinks,
  addLinkToGroup,
  removeLinkFromGroup,
  getGroupLinks,
  updateGroupLink,
  loadLinks,
  exportGroups,
  importGroups
} from './js/storage.js';
import { loadSettings } from './js/settings.js';

// 生成 UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 当前状态
let currentGroupId = null;
let allLinks = [];
let filteredLinks = [];

// DOM 元素
const container = document.getElementById('container');
const statusMessage = document.getElementById('statusMessage');
const backBtn = document.getElementById('backBtn');
const homeBtn = document.getElementById('homeBtn');
const addGroupBtn = document.getElementById('addGroupBtn');
const openAllBtn = document.getElementById('openAllBtn');
const addLinkBtn = document.getElementById('addLinkBtn');
const exportGroupsBtn = document.getElementById('exportGroupsBtn');
const importGroupsBtn = document.getElementById('importGroupsBtn');
const importFileInput = document.getElementById('importFileInput');
const searchContainer = document.getElementById('searchContainer');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');

// 对话框
const groupDialogOverlay = document.getElementById('groupDialogOverlay');
const groupDialogTitle = document.getElementById('groupDialogTitle');
const groupNameInput = document.getElementById('groupNameInput');
const groupCancelBtn = document.getElementById('groupCancelBtn');
const groupSaveBtn = document.getElementById('groupSaveBtn');

const linkDialogOverlay = document.getElementById('linkDialogOverlay');
const linkTitleInput = document.getElementById('linkTitleInput');
const linkUrlInput = document.getElementById('linkUrlInput');
const linkCancelBtn = document.getElementById('linkCancelBtn');
const linkSaveBtn = document.getElementById('linkSaveBtn');

const selectLinkDialogOverlay = document.getElementById('selectLinkDialogOverlay');
const linkSelectorContainer = document.getElementById('linkSelectorContainer');
const linkSearchInput = document.getElementById('linkSearchInput');
const selectLinkCancelBtn = document.getElementById('selectLinkCancelBtn');
const selectLinkSaveBtn = document.getElementById('selectLinkSaveBtn');

// 选择链接对话框中的可用链接列表
let availableLinksForSelector = [];

const deleteDialogOverlay = document.getElementById('deleteDialogOverlay');
const deleteMessage = document.getElementById('deleteMessage');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

// 编辑状态
let editingGroupId = null;
let editingLinkId = null;
let pendingDeleteAction = null;

// 初始化
async function init() {
  try {
    // 检查 URL 参数
    const urlParams = new URLSearchParams(window.location.search);
    currentGroupId = urlParams.get('groupId');

    // 加载设置并应用紧凑模式
    try {
      const settings = await loadSettings();
      if (settings && settings.compactMode && settings.compactMode.enabled) {
        document.body.classList.add('compact-mode');
      }
    } catch (e) {
      console.warn('加载设置失败，使用默认样式');
    }

    if (currentGroupId) {
      // 组内视图
      showGroupView();
      await loadGroupLinks();
    } else {
      // 分组列表视图
      showGroupsListView();
      await loadGroupsList();
    }

    // 加载所有链接（用于添加链接到分组）
    try {
      allLinks = await loadLinks();
      console.log('[init] 加载到链接数量:', allLinks.length);
    } catch (e) {
      console.error('加载链接失败:', e);
      allLinks = [];
    }
  } catch (error) {
    console.error('初始化失败:', error);
    showStatus('初始化失败: ' + error.message, true);
  }
}

// 显示分组列表视图
function showGroupsListView() {
  document.querySelector('h1').textContent = '分组管理';
  backBtn.style.display = 'none';
  homeBtn.style.display = 'block';
  openAllBtn.style.display = 'none';
  addLinkBtn.style.display = 'none';
  searchContainer.style.display = 'none';
  addGroupBtn.textContent = '新建分组';
}

// 显示组内视图
function showGroupView() {
  backBtn.style.display = 'block';
  homeBtn.style.display = 'none';
  openAllBtn.style.display = 'block';
  addLinkBtn.style.display = 'block';
  searchContainer.style.display = 'block';
  addGroupBtn.style.display = 'none';
  // 标题在 loadGroupLinks 中根据分组名设置
}

// 显示状态消息
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.display = 'block';
  statusMessage.className = 'status-message' + (isError ? ' error' : '');

  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 3000);
}

// 加载分组列表
async function loadGroupsList() {
  try {
    const groups = await loadGroups();
    renderGroups(groups);
  } catch (error) {
    console.error('加载分组失败:', error);
    showStatus('加载分组失败: ' + error.message, true);
  }
}

// 渲染分组列表
// 当前分组列表缓存（用于排序）
let currentGroups = [];

function renderGroups(groups) {
  // 保存到缓存用于排序
  currentGroups = groups;

  if (!groups || groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无分组</p>
        <p>点击下方"新建分组"按钮创建</p>
      </div>
    `;
    return;
  }

  // 按 order 排序
  const sortedGroups = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));

  container.innerHTML = sortedGroups.map((group, index) => `
    <div class="group-card" data-group-id="${group.groupId}" data-index="${index}">
      <div class="group-header">
        <span class="group-name">${escapeHtml(group.groupName)}</span>
        <span class="group-count">${group.linkIds ? group.linkIds.length : 0} 个链接</span>
      </div>
      <div class="group-actions" onclick="event.stopPropagation()">
        <button class="action-btn open-all" data-action="open-all" title="批量打开">▶</button>
        <button class="action-btn move-up" data-action="move-up" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="action-btn move-down" data-action="move-down" title="下移" ${index === sortedGroups.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="action-btn edit" data-action="edit" title="编辑">✎</button>
        <button class="action-btn delete" data-action="delete" title="删除">✕</button>
      </div>
    </div>
  `).join('');

  // 绑定事件
  container.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('action-btn')) return;
      const groupId = card.dataset.groupId;
      navigateToGroup(groupId);
    });
  });

  container.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = e.target.closest('.group-card').dataset.groupId;
      editGroup(groupId);
    });
  });

  container.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = e.target.closest('.group-card').dataset.groupId;
      confirmDeleteGroup(groupId);
    });
  });

  // 绑定批量打开按钮事件
  container.querySelectorAll('.action-btn.open-all').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = e.target.closest('.group-card').dataset.groupId;
      // 批量打开该分组的链接
      try {
        const links = await getGroupLinks(groupId);
        if (links.length === 0) {
          showStatus('分组内没有链接', true);
          return;
        }
        // 逐个打开链接
        for (const link of links) {
          chrome.tabs.create({ url: link.url, active: false });
        }
        showStatus(`已打开 ${links.length} 个链接`);
      } catch (error) {
        console.error('批量打开失败:', error);
        showStatus('打开失败: ' + error.message, true);
      }
    });
  });

  // 绑定排序按钮事件
  container.querySelectorAll('.action-btn.move-up').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.closest('.group-card').dataset.index);
      await moveGroup(index, index - 1);
    });
  });

  container.querySelectorAll('.action-btn.move-down').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.closest('.group-card').dataset.index);
      await moveGroup(index, index + 1);
    });
  });
}

// 移动分组
async function moveGroup(fromIndex, toIndex) {
  const sortedGroups = [...currentGroups].sort((a, b) => (a.order || 0) - (b.order || 0));

  if (toIndex < 0 || toIndex >= sortedGroups.length) return;

  // 交换顺序
  const temp = sortedGroups[fromIndex].order;
  sortedGroups[fromIndex].order = sortedGroups[toIndex].order;
  sortedGroups[toIndex].order = temp;

  // 保存到数据库
  const orders = sortedGroups.map((g, i) => ({ groupId: g.groupId, order: g.order || i }));
  await reorderGroups(orders);

  // 重新渲染
  await loadGroupsList();
}

// 加载组内链接
async function loadGroupLinks() {
  try {
    const links = await getGroupLinks(currentGroupId);
    filteredLinks = links;
    renderGroupLinks(links);

    // 获取分组信息，更新标题
    const groups = await loadGroups();
    const group = groups.find(g => g.groupId === currentGroupId);
    if (group) {
      document.querySelector('h1').textContent = group.groupName;
    }
  } catch (error) {
    console.error('加载组内链接失败:', error);
    showStatus('加载链接失败: ' + error.message, true);
  }
}

// 当前组内链接缓存（用于排序）
let currentGroupLinks = [];

// 渲染组内链接
function renderGroupLinks(links) {
  // 保存到缓存用于排序
  currentGroupLinks = links;

  if (!links || links.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>该分组暂无链接</p>
        <p>点击"添加链接"按钮从收藏夹添加</p>
      </div>
    `;
    return;
  }

  container.innerHTML = links.map((link, index) => `
    <div class="link-card" data-link-id="${link.id}" data-index="${index}">
      <div class="card-header">
        <a class="link-title" href="${escapeHtml(link.url)}" target="_blank">${escapeHtml(link.title)}</a>
        <div class="card-actions">
          <button class="action-btn move-up" data-action="move-up" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="action-btn move-down" data-action="move-down" title="下移" ${index === links.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="action-btn edit" data-action="edit" title="编辑">✎</button>
          <button class="remove-btn" data-action="remove" title="从分组移除">✕</button>
        </div>
      </div>
      <div class="link-url">
        <a href="${escapeHtml(link.url)}" target="_blank">${escapeHtml(link.url)}</a>
      </div>
    </div>
  `).join('');

  // 绑定事件
  container.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const linkId = parseInt(e.target.closest('.link-card').dataset.linkId);
      editLink(linkId);
    });
  });

  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const linkId = parseInt(e.target.closest('.link-card').dataset.linkId);
      confirmRemoveLink(linkId);
    });
  });

  // 绑定排序按钮事件
  container.querySelectorAll('.action-btn.move-up').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('.link-card').dataset.index);
      await moveGroupLink(index, index - 1);
    });
  });

  container.querySelectorAll('.action-btn.move-down').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('.link-card').dataset.index);
      await moveGroupLink(index, index + 1);
    });
  });
}

// 移动组内链接
async function moveGroupLink(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= currentGroupLinks.length) return;

  // 复制并交换
  const newOrder = [...currentGroupLinks.map(l => l.id)];
  const temp = newOrder[fromIndex];
  newOrder[fromIndex] = newOrder[toIndex];
  newOrder[toIndex] = temp;

  // 保存到数据库
  await reorderGroupLinks(currentGroupId, newOrder);

  // 重新渲染
  await loadGroupLinks();
}

// 导航到分组
function navigateToGroup(groupId) {
  window.location.href = `group.html?groupId=${groupId}`;
}

// 返回分组列表
backBtn.addEventListener('click', () => {
  window.location.href = 'group.html';
});

// 检测是否从快捷键打开
const urlParams = new URLSearchParams(window.location.search);
const fromShortcut = urlParams.get('from') === 'shortcut';

// 返回主页
homeBtn.addEventListener('click', () => {
  if (window.parent !== window) {
    // 在 iframe 内：通知父页面关闭 overlay
    window.parent.postMessage('closeOverlay', '*');
  } else {
    // 独立窗口（快捷键打开）：跳转回主页
    window.location.href = 'popup.html';
  }
});

// 新建分组
addGroupBtn.addEventListener('click', () => {
  editingGroupId = null;
  groupDialogTitle.textContent = '新建分组';
  groupNameInput.value = '';
  showDialog(groupDialogOverlay);
});

// 编辑分组
async function editGroup(groupId) {
  const groups = await loadGroups();
  const group = groups.find(g => g.groupId === groupId);
  if (!group) return;

  editingGroupId = groupId;
  groupDialogTitle.textContent = '编辑分组';
  groupNameInput.value = group.groupName;
  showDialog(groupDialogOverlay);
}

// 确认删除分组
function confirmDeleteGroup(groupId) {
  pendingDeleteAction = async () => {
    try {
      await deleteGroup(groupId);
      showStatus('分组已删除');
      loadGroupsList();
    } catch (error) {
      console.error('删除分组失败:', error);
      showStatus('删除失败: ' + error.message, true);
    }
  };
  deleteMessage.textContent = '确定要删除这个分组吗？删除后该分组内的链接引用将被移除，但原始链接会保留。';
  showDialog(deleteDialogOverlay);
}

// 保存分组
groupSaveBtn.addEventListener('click', async () => {
  const name = groupNameInput.value.trim();
  if (!name) {
    showStatus('请输入分组名称', true);
    return;
  }

  try {
    if (editingGroupId) {
      // 更新分组
      await updateGroup(editingGroupId, { groupName: name });
      showStatus('分组已更新');
    } else {
      // 新建分组
      const groups = await loadGroups();
      const newGroup = {
        groupId: generateUUID(),
        groupName: name,
        order: groups.length,
        linkIds: []
      };
      await addGroup(newGroup);
      showStatus('分组已创建');
    }
    hideDialog(groupDialogOverlay);
    loadGroupsList();
  } catch (error) {
    console.error('保存分组失败:', error);
    showStatus('保存失败: ' + error.message, true);
  }
});

groupCancelBtn.addEventListener('click', () => {
  hideDialog(groupDialogOverlay);
});

// 添加链接到分组
addLinkBtn.addEventListener('click', async () => {
  // 获取当前分组已存在的链接 ID
  const groups = await loadGroups();
  const currentGroup = groups.find(g => g.groupId === currentGroupId);
  const existingIds = currentGroup ? currentGroup.linkIds : [];

  console.log('[addLink] allLinks数量:', allLinks.length, '已存在ID:', existingIds);

  // 过滤出未添加的链接
  availableLinksForSelector = allLinks.filter(link => !existingIds.includes(link.id));

  console.log('[addLink] 可用链接数量:', availableLinksForSelector.length);

  if (allLinks.length === 0) {
    showStatus('主收藏夹中没有链接，请先在主页添加', true);
    return;
  }

  if (availableLinksForSelector.length === 0) {
    showStatus('该分组已添加所有链接', true);
    return;
  }

  // 清空搜索框
  linkSearchInput.value = '';

  // 渲染链接选择列表
  renderLinkSelector(availableLinksForSelector);

  showDialog(selectLinkDialogOverlay);
});

// 渲染链接选择列表
function renderLinkSelector(links) {
  if (links.length === 0) {
    linkSelectorContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">没有匹配的链接</div>';
    return;
  }

  linkSelectorContainer.innerHTML = links.map(link => `
    <div class="link-selector-item">
      <input type="checkbox" data-link-id="${link.id}" value="${link.id}">
      <span class="item-title">${escapeHtml(link.title)}</span>
      <span class="item-url">${escapeHtml(link.url)}</span>
    </div>
  `).join('');
}

// 搜索链接
linkSearchInput.addEventListener('input', () => {
  const keyword = linkSearchInput.value.trim().toLowerCase();

  if (!keyword) {
    renderLinkSelector(availableLinksForSelector);
    return;
  }

  const filtered = availableLinksForSelector.filter(link => {
    const title = (link.title || '').toLowerCase();
    const url = (link.url || '').toLowerCase();
    return title.includes(keyword) || url.includes(keyword);
  });

  renderLinkSelector(filtered);
});

// 确认添加链接
selectLinkSaveBtn.addEventListener('click', async () => {
  const checkedItems = linkSelectorContainer.querySelectorAll('input:checked');
  const selectedIds = Array.from(checkedItems).map(item => parseInt(item.dataset.linkId));

  if (selectedIds.length === 0) {
    showStatus('请选择至少一个链接', true);
    return;
  }

  try {
    for (const linkId of selectedIds) {
      await addLinkToGroup(currentGroupId, linkId);
    }
    showStatus(`已添加 ${selectedIds.length} 个链接到分组`);
    hideDialog(selectLinkDialogOverlay);
    loadGroupLinks();
  } catch (error) {
    console.error('添加链接失败:', error);
    showStatus('添加失败: ' + error.message, true);
  }
});

selectLinkCancelBtn.addEventListener('click', () => {
  hideDialog(selectLinkDialogOverlay);
});

// 编辑链接
async function editLink(linkId) {
  const links = await getGroupLinks(currentGroupId);
  const link = links.find(l => l.id === linkId);
  if (!link) return;

  editingLinkId = linkId;
  linkTitleInput.value = link.title;
  linkUrlInput.value = link.url;
  showDialog(linkDialogOverlay);
}

// 保存链接编辑
linkSaveBtn.addEventListener('click', async () => {
  const title = linkTitleInput.value.trim();
  const url = linkUrlInput.value.trim();

  if (!title || !url) {
    showStatus('请填写标题和网址', true);
    return;
  }

  try {
    await updateGroupLink(currentGroupId, editingLinkId, { title, url });
    showStatus('链接已更新');
    hideDialog(linkDialogOverlay);
    loadGroupLinks();
  } catch (error) {
    console.error('更新链接失败:', error);
    showStatus('更新失败: ' + error.message, true);
  }
});

linkCancelBtn.addEventListener('click', () => {
  hideDialog(linkDialogOverlay);
});

// 确认移除链接
function confirmRemoveLink(linkId) {
  pendingDeleteAction = async () => {
    try {
      await removeLinkFromGroup(currentGroupId, linkId);
      showStatus('已从分组移除链接');
      loadGroupLinks();
    } catch (error) {
      console.error('移除链接失败:', error);
      showStatus('移除失败: ' + error.message, true);
    }
  };
  deleteMessage.textContent = '确定要从分组中移除这个链接吗？原始链接会保留在收藏夹中。';
  showDialog(deleteDialogOverlay);
}

// 确认删除按钮
deleteConfirmBtn.addEventListener('click', () => {
  if (pendingDeleteAction) {
    pendingDeleteAction();
    pendingDeleteAction = null;
  }
  hideDialog(deleteDialogOverlay);
});

deleteCancelBtn.addEventListener('click', () => {
  pendingDeleteAction = null;
  hideDialog(deleteDialogOverlay);
});

// 批量打开组内所有链接
openAllBtn.addEventListener('click', async () => {
  try {
    const links = await getGroupLinks(currentGroupId);
    if (links.length === 0) {
      showStatus('分组内没有链接', true);
      return;
    }

    // 逐个打开链接
    for (const link of links) {
      chrome.tabs.create({ url: link.url, active: false });
    }
    showStatus(`已打开 ${links.length} 个链接`);
  } catch (error) {
    console.error('批量打开失败:', error);
    showStatus('打开失败: ' + error.message, true);
  }
});

// 导出分组数据
exportGroupsBtn.addEventListener('click', async () => {
  try {
    const groups = await exportGroups();
    if (groups.length === 0) {
      showStatus('没有分组可导出', true);
      return;
    }

    const dataStr = JSON.stringify(groups, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `reading-share-groups-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showStatus(`已导出 ${groups.length} 个分组`);
  } catch (error) {
    console.error('导出分组失败:', error);
    showStatus('导出失败: ' + error.message, true);
  }
});

// 导入分组数据
importGroupsBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const groups = JSON.parse(text);

    if (!Array.isArray(groups)) {
      throw new Error('文件格式错误');
    }

    const result = await importGroups(groups);
    showStatus(`导入完成：新增/更新 ${result.imported} 个，跳过 ${result.skipped} 个`);

    // 重新加载分组列表
    await loadGroupsList();
  } catch (error) {
    console.error('导入分组失败:', error);
    showStatus('导入失败: ' + error.message, true);
  } finally {
    // 清空文件输入
    importFileInput.value = '';
  }
});

// 搜索功能
searchInput.addEventListener('input', async () => {
  const keyword = searchInput.value.trim().toLowerCase();

  if (!keyword) {
    filteredLinks = await getGroupLinks(currentGroupId);
  } else {
    const allGroupLinks = await getGroupLinks(currentGroupId);
    filteredLinks = allGroupLinks.filter(link => {
      return link.title.toLowerCase().includes(keyword) ||
             link.url.toLowerCase().includes(keyword);
    });
  }

  renderGroupLinks(filteredLinks);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  loadGroupLinks();
});

// 工具函数
function showDialog(overlay) {
  overlay.classList.add('show');
}

function hideDialog(overlay) {
  overlay.classList.remove('show');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 按ESC键关闭窗口
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    console.log('按下ESC键，关闭窗口');
    window.close();
  }
});

// 启动
init();
