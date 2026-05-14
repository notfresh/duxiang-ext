# 搜索历史 LRU 缓存实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 popup 搜索框增加历史搜索词的 LRU 缓存功能，支持 pin（固定）和手动删除，Pin 的关键词永远不被淘汰。

**Architecture:** 新建 `js/searchHistory.js` 独立模块，使用 `chrome.storage.local` 存储历史数据，在 `popup.js` 中集成搜索框下拉列表 UI 交互，在设置对话框增加最大条数配置。

**Tech Stack:** vanilla JS ES6 modules, chrome.storage.local API

---

### Task 1: 新建 `js/searchHistory.js` 核心模块

**Files:**
- Create: `js/searchHistory.js`

- [ ] **Step 1: 创建 searchHistory.js 核心模块**

数据结构使用 `chrome.storage.local`，key 为 `searchHistory`：

```js
{
  items: [
    { text: "react", pinned: true, lastUsed: 1715760000000 },
    { text: "tag:前端", pinned: false, lastUsed: 1715759000000 },
  ],
  maxCount: 10
}
```

创建 `js/searchHistory.js`，包含以下功能：

```js
const STORAGE_KEY = 'searchHistory';
const DEFAULT_MAX_COUNT = 10;

/**
 * 从 chrome.storage.local 读取完整的搜索历史数据
 * @returns {Promise<{ items: Array<{text: string, pinned: boolean, lastUsed: number}>, maxCount: number }>}
 */
async function loadStorageData() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError || !result[STORAGE_KEY]) {
        resolve({ items: [], maxCount: DEFAULT_MAX_COUNT });
        return;
      }
      resolve(result[STORAGE_KEY]);
    });
  });
}

/**
 * 保存数据到 chrome.storage.local
 * @param {Object} data - 要保存的数据
 */
async function saveStorageData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
      resolve();
    });
  });
}

/**
 * 获取完整历史列表（pinned 在前，非 pinned 在后，各自内部按 lastUsed 倒序）
 * @returns {Promise<Array<{text: string, pinned: boolean, lastUsed: number}>>}
 */
export async function loadHistory() {
  const data = await loadStorageData();
  return sortItems(data.items);
}

/**
 * 对条目排序：pinned 在前，非 pinned 在后，各自内部按 lastUsed 倒序
 */
function sortItems(items) {
  const pinned = items.filter(i => i.pinned).sort((a, b) => b.lastUsed - a.lastUsed);
  const unpinned = items.filter(i => !i.pinned).sort((a, b) => b.lastUsed - a.lastUsed);
  return [...pinned, ...unpinned];
}

/**
 * 记录一条搜索词，更新 lastUsed，触发 LRU 淘汰
 * @param {string} keyword - 搜索关键词
 */
export async function addSearchKeyword(keyword) {
  if (!keyword || !keyword.trim()) return;

  const data = await loadStorageData();
  const trimmed = keyword.trim();

  // 如果词已存在，更新 lastUsed
  const existing = data.items.find(i => i.text === trimmed);
  if (existing) {
    existing.lastUsed = Date.now();
  } else {
    // 新增条目
    data.items.push({ text: trimmed, pinned: false, lastUsed: Date.now() });
  }

  // 淘汰超出限制的非 pinned 条目
  const unpinned = data.items.filter(i => !i.pinned);
  const maxCount = data.maxCount || DEFAULT_MAX_COUNT;
  if (unpinned.length > maxCount) {
    // 按 lastUsed 排序，保留最新的 maxCount 条
    unpinned.sort((a, b) => b.lastUsed - a.lastUsed);
    const toRemove = unpinned.slice(maxCount);
    data.items = data.items.filter(i => i.pinned || !toRemove.includes(i));
  }

  await saveStorageData(data);
}

/**
 * 切换指定词的 pin 状态
 * @param {string} keyword - 搜索关键词
 */
export async function togglePinKeyword(keyword) {
  if (!keyword || !keyword.trim()) return;

  const data = await loadStorageData();
  const item = data.items.find(i => i.text === keyword.trim());
  if (item) {
    item.pinned = !item.pinned;
    await saveStorageData(data);
  }
}

/**
 * 删除指定历史词
 * @param {string} keyword - 搜索关键词
 */
export async function deleteKeyword(keyword) {
  if (!keyword || !keyword.trim()) return;

  const data = await loadStorageData();
  const trimmed = keyword.trim();
  data.items = data.items.filter(i => i.text !== trimmed);
  await saveStorageData(data);
}

/**
 * 获取当前最大数量配置
 * @returns {Promise<number>}
 */
export async function getMaxCount() {
  const data = await loadStorageData();
  return data.maxCount || DEFAULT_MAX_COUNT;
}

/**
 * 设置最大数量，超出部分立即淘汰
 * @param {number} count - 最大数量
 */
export async function setMaxCount(count) {
  const num = Math.max(1, Math.floor(count));
  const data = await loadStorageData();
  data.maxCount = num;

  // 淘汰多余的非 pinned 条目
  const unpinned = data.items.filter(i => !i.pinned).sort((a, b) => b.lastUsed - a.lastUsed);
  if (unpinned.length > num) {
    const toRemove = new Set(unpinned.slice(num).map(i => i.text));
    data.items = data.items.filter(i => i.pinned || !toRemove.has(i.text));
  }

  await saveStorageData(data);
}
```

- [ ] **Step 2: 验证文件创建**

确认 `js/searchHistory.js` 创建成功，语法正确：

```bash
node -c "c:\projects\duxiang-pack\duxiang-ext\js\searchHistory.js"
```

Expected: 无输出（syntax OK）

- [ ] **Step 3: 提交**

```bash
git add js/searchHistory.js
git commit -m "feat: 新增搜索历史 LRU 缓存模块

- 支持添加、删除、pin 搜索词
- LRU 淘汰策略：pinned 词永久保留，非 pinned 词按最后使用时间排序淘汰
- 可配置最大保存条数
- 使用 chrome.storage.local 存储"
```

---

### Task 2: popup.html 新增下拉列表 DOM 结构

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: 在搜索框容器下方添加下拉列表容器**

在 `popup.html` 中，找到搜索框容器（`class="search-container"`），在其下方添加下拉列表容器：

```html
  <!-- 搜索框 -->
  <div class="search-container">
    <div class="search-wrapper">
      <input type="text" id="searchInput" class="search-input" placeholder="搜索... 支持 tag: title: url: 前缀过滤">
      <button id="clearSearchBtn" class="search-clear-btn" title="清除搜索">×</button>
    </div>
    <!-- 搜索历史下拉列表 -->
    <div id="searchHistoryDropdown" class="search-history-dropdown" style="display: none;"></div>
  </div>
```

- [ ] **Step 2: 提交**

```bash
git add popup.html
git commit -m "feat: popup.html 新增搜索历史下拉列表容器"
```

---

### Task 3: popup.css 新增下拉列表样式

**Files:**
- Modify: `popup.css`

- [ ] **Step 1: 在 `popup.css` 末尾添加下拉列表样式**

```css
/* 搜索框容器需要 relative 定位，以便子元素 absolute 定位 */
.search-container {
  position: relative;
}

/* ========== 搜索历史下拉列表样式 ========== */
.search-history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: white;
  border: 1px solid #ddd;
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
}

.search-history-dropdown::-webkit-scrollbar {
  width: 6px;
}

.search-history-dropdown::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.search-history-dropdown::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.search-history-dropdown::-webkit-scrollbar-thumb:hover {
  background: #999;
}

.search-history-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
  color: #333;
}

.search-history-item:last-child {
  border-bottom: none;
}

.search-history-item:hover {
  background-color: #f5f5f5;
}

.search-history-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-history-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 8px;
}

.search-history-pin-btn,
.search-history-delete-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  color: #999;
  transition: color 0.2s;
}

.search-history-pin-btn:hover {
  color: #FF9800;
}

.search-history-pin-btn.pinned {
  color: #FF9800;
}

.search-history-pin-btn.pinned:hover {
  color: #e65100;
}

.search-history-delete-btn:hover {
  color: #f44336;
}

.search-history-separator {
  height: 1px;
  background-color: #e0e0e0;
  margin: 0 10px;
}
```

- [ ] **Step 2: 提交**

```bash
git add popup.css
git commit -m "feat: popup.css 新增搜索历史下拉列表样式"
```

---

### Task 4: settings.js 增加搜索历史配置

**Files:**
- Modify: `js/settings.js`

- [ ] **Step 1: 在 `getDefaultSettings()` 中添加 `searchHistory` 默认配置**

找到 `js/settings.js` 中的 `getDefaultSettings()` 函数，在 `compactMode` 同级添加 `searchHistory`：

```js
export function getDefaultSettings() {
  return {
    syncPeerUrl: '',
    compactMode: {
      enabled: false,
      showUrl: true,
      showDate: true,
      showTags: true,
      cardPadding: 12,
      cardMargin: 10,
      titleFontSize: 16,
      urlFontSize: 14,
      metaFontSize: 12,
      titleMaxChars: 0,
      urlMaxChars: 0
    },
    searchHistory: {
      maxCount: 10
    }
  };
}
```

- [ ] **Step 2: 在 `loadSettings()` 的 merge 逻辑中添加 `searchHistory` 的深合并**

找到 `loadSettings()` 中的 merge 部分，添加 `searchHistory` 的合并：

```js
    if (result && result.value) {
      const merged = {
        ...defaultSettings,
        ...result.value,
        compactMode: {
          ...defaultSettings.compactMode,
          ...(result.value.compactMode || {})
        },
        searchHistory: {
          ...defaultSettings.searchHistory,
          ...(result.value.searchHistory || {})
        }
      };
```

- [ ] **Step 3: 提交**

```bash
git add js/settings.js
git commit -m "feat: 设置模块新增搜索历史 maxCount 配置项"
```

---

### Task 5: popup.js 集成搜索历史 UI 交互

**Files:**
- Modify: `popup.js`

这是最大的一个任务。需要修改 `popup.js` 的多个位置。

- [ ] **Step 1: 添加搜索历史模块的 import**

在 `popup.js` 顶部 import 区域，添加：

```js
import { loadHistory, addSearchKeyword, togglePinKeyword, deleteKeyword, getMaxCount, setMaxCount } from './js/searchHistory.js';
```

- [ ] **Step 2: 获取下拉列表 DOM 元素**

在搜索相关元素获取区域（`searchInput`、`clearSearchBtn` 之后）添加：

```js
  // 搜索历史相关元素
  const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
```

- [ ] **Step 3: 添加状态变量**

在 `currentSettings` 附近添加：

```js
  let historyCache = [];        // 缓存的历史记录列表
  let historyMaxCount = 10;     // 最大历史记录数
  let hideDropdownTimeout = null; // 延迟隐藏定时器
```

- [ ] **Step 4: 添加渲染历史下拉列表的函数**

在 `handleSearchResults` 函数之前，添加：

```js
  // 渲染搜索历史下拉列表
  function renderSearchHistory() {
    if (!searchHistoryDropdown) return;

    if (historyCache.length === 0) {
      searchHistoryDropdown.innerHTML = '<div class="search-history-item" style="color:#999; cursor:default;">暂无搜索历史</div>';
      searchHistoryDropdown.style.display = 'block';
      return;
    }

    const pinned = historyCache.filter(i => i.pinned);
    const unpinned = historyCache.filter(i => !i.pinned);

    let html = '';

    // Pinned 词区
    if (pinned.length > 0) {
      pinned.forEach(item => {
        html += `
          <div class="search-history-item" data-keyword="${escapeHtml(item.text)}">
            <span class="search-history-item-text">${escapeHtml(item.text)}</span>
            <div class="search-history-item-actions">
              <button class="search-history-pin-btn pinned" data-action="togglePin" data-keyword="${escapeHtml(item.text)}" title="取消固定">📌</button>
              <button class="search-history-delete-btn" data-action="delete" data-keyword="${escapeHtml(item.text)}" title="删除">✕</button>
            </div>
          </div>
        `;
      });
    }

    // 分隔线（同时有 pinned 和 unpinned 时显示）
    if (pinned.length > 0 && unpinned.length > 0) {
      html += '<div class="search-history-separator"></div>';
    }

    // 普通历史词区
    unpinned.forEach(item => {
      html += `
        <div class="search-history-item" data-keyword="${escapeHtml(item.text)}">
          <span class="search-history-item-text">${escapeHtml(item.text)}</span>
          <div class="search-history-item-actions">
            <button class="search-history-pin-btn" data-action="togglePin" data-keyword="${escapeHtml(item.text)}" title="固定">📌</button>
            <button class="search-history-delete-btn" data-action="delete" data-keyword="${escapeHtml(item.text)}" title="删除">✕</button>
          </div>
        </div>
      `;
    });

    searchHistoryDropdown.innerHTML = html;
    searchHistoryDropdown.style.display = 'block';
  }
```

- [ ] **Step 5: 添加下拉列表显示/隐藏和事件绑定函数**

紧接着上一步的函数后面添加：

```js
  // 显示搜索历史下拉列表
  function showSearchHistoryDropdown() {
    clearTimeout(hideDropdownTimeout);
    renderSearchHistory();
  }

  // 隐藏搜索历史下拉列表
  function hideSearchHistoryDropdown() {
    hideDropdownTimeout = setTimeout(() => {
      if (searchHistoryDropdown) {
        searchHistoryDropdown.style.display = 'none';
      }
    }, 200);
  }

  // 刷新历史缓存并渲染
  async function refreshHistoryCache() {
    historyCache = await loadHistory();
    historyMaxCount = await getMaxCount();
    if (searchHistoryDropdown && searchHistoryDropdown.style.display === 'block') {
      renderSearchHistory();
    }
  }

  // 绑定搜索历史下拉列表事件（合并为一个 handler，避免两个 click 监听冲突）
  function bindSearchHistoryEvents() {
    if (!searchHistoryDropdown) return;

    searchHistoryDropdown.addEventListener('click', async (e) => {
      e.stopPropagation();

      // 优先处理按钮点击（pin/delete）
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const keyword = actionBtn.dataset.keyword;

        if (action === 'togglePin') {
          await togglePinKeyword(keyword);
          await refreshHistoryCache();
        } else if (action === 'delete') {
          await deleteKeyword(keyword);
          await refreshHistoryCache();
        }
        return;
      }

      // 否则处理历史词文本点击
      const item = e.target.closest('.search-history-item');
      if (!item) return;

      const keyword = item.dataset.keyword;
      if (!keyword) return;

      // 如果点击的是按钮区域，不触发选择
      if (e.target.closest('.search-history-item-actions')) return;

      searchInput.value = keyword;
      searchHistoryDropdown.style.display = 'none';

      // 触发搜索并记录
      await addSearchKeyword(keyword);
      const { searchLinks } = await import('./js/search.js');
      const filtered = searchLinks(keyword, loadedLinks);
      handleSearchResults(filtered, keyword);
    });

    // 下拉列表本身也需要阻止 blur 触发（防止点击下拉列表时先 blur searchInput）
    searchHistoryDropdown.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 阻止 searchInput blur
    });
  }
```

- [ ] **Step 6: 在搜索框的 focus/blur 事件上绑定历史下拉列表**

找到搜索相关的事件绑定区域（`setupSearch` 调用之后），添加：

```js
  // 搜索框 focus：当输入为空时显示历史下拉列表
  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) {
      showSearchHistoryDropdown();
    }
  });

  // 搜索框 blur：延迟隐藏历史下拉列表
  searchInput.addEventListener('blur', () => {
    hideSearchHistoryDropdown();
  });

  // 搜索框输入时隐藏历史下拉列表
  searchInput.addEventListener('input', () => {
    if (searchInput.value.trim() && searchHistoryDropdown) {
      searchHistoryDropdown.style.display = 'none';
    }
  });

  // 清除搜索后，如果输入为空且获得焦点，显示历史下拉列表
  clearSearchBtn.addEventListener('click', () => {
    setTimeout(() => {
      if (!searchInput.value.trim() && document.activeElement === searchInput) {
        showSearchHistoryDropdown();
      }
    }, 50);
  });
```

- [ ] **Step 7: 在搜索执行时记录历史词**

当搜索有内容且执行搜索时记录历史词。最简洁的方式是在 `handleSearchResults` 回调中判断。

找到 `handleSearchResults` 函数，在函数开头添加：

```js
  // 处理搜索结果（全量数据搜索）
  async function handleSearchResults(filteredLinks, searchText) {
    // 记录搜索历史（有搜索内容时）
    if (searchText && searchText.trim()) {
      await addSearchKeyword(searchText.trim());
    }

    if (searchText) {
```

注意：由于 `handleSearchResults` 现在变成 async 函数，而 `setupSearch` 中 `onSearch` 是同步调用，但 async 函数返回 Promise 不影响调用方（调用方不 await 它）。所以不会影响现有行为。

- [ ] **Step 8: 绑定下拉列表事件和初始化加载**

在 `DOMContentLoaded` 的初始加载区域（绑定按钮事件 `addBtn.addEventListener` 之前），添加事件绑定：

```js
  bindSearchHistoryEvents();
```

在初始加载区域（`loadAndApplySettings` 的 `.then()` 中）添加：

```js
  loadAndApplySettings().then(() => {
    console.log('[popup] 设置加载完成，开始加载链接');
    loadLinksFromStorage();
    checkAndShowShortcutTip();
    refreshHistoryCache();  // 加载搜索历史缓存
  })
```

- [ ] **Step 9: 在 `loadLinksFromStorage` 中刷新历史缓存**

在 `loadLinksFromStorage` 函数中，找到 `updateSearchFn` 调用之后的位置（大约在 `if (total > PAGE_SIZE)` 之前），添加：

```js
    refreshHistoryCache();
```

同时在归档操作后的 `updateSearchFn` 调用后也添加（在 `archiveLink` 和 `deleteLink` 相关的 `updateSearchFn` 调用后各添加一行 `refreshHistoryCache()`），以确保数据变化时历史列表更新。

具体位置：
1. `loadLinksFromStorage` 中 `updateSearchFn(loadedLinks)` 之后
2. `addArchiveButtons` 中 archive 操作的 `updateSearchFn(loadedLinks)` 之后
3. `handleDeleteLink` 中 `updateSearchFn(loadedLinks)` 之后
4. `saveEdit` 中 `updateSearchFn(loadedLinks)` 之后
5. `saveEdit` 中新增链接后的 `updateSearchFn(loadedLinks)` 之后

- [ ] **Step 11: 提交**

```bash
git add popup.js
git commit -m "feat: popup.js 集成搜索历史 UI 交互

- 搜索框 focus 时显示历史下拉列表
- 点击历史词填入搜索框并触发搜索
- 支持 pin/unpin 和删除历史词
- 输入非空时隐藏历史列表，Enter 键记录搜索词"
```

---

### Task 6: 设置对话框集成搜索历史配置

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`

- [ ] **Step 1: 在 popup.html 的设置对话框中添加搜索历史配置 section**

找到 `popup.html` 设置对话框中 `紧凑模式` section 之后（`input-group` for `compactModeCheckbox` 之后），添加新的 section：

```html
      <div class="input-group" style="margin-top: 15px;">
        <label style="font-size: 14px; color: #555; font-weight: 500; margin-bottom: 8px; display: block;">🔍 搜索历史：</label>
        <div>
          <label for="searchHistoryMaxCountInput" style="display: block; margin-bottom: 4px; font-size: 13px; color: #666;">最大保存条数：</label>
          <input type="number" id="searchHistoryMaxCountInput" min="1" max="100" value="10" style="width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
          <span style="font-size: 12px; color: #999; margin-left: 8px;">（默认 10，仅保留最近使用的未固定词条）</span>
        </div>
      </div>
```

- [ ] **Step 2: 在 popup.js 中添加设置对话框的事件绑定**

在获取 DOM 元素区域添加：

```js
  const searchHistoryMaxCountInput = document.getElementById('searchHistoryMaxCountInput');
```

在 `showSettingsDialog()` 函数中，填充当前设置值的部分，添加：

```js
    // 填充搜索历史设置
    if (currentSettings && currentSettings.searchHistory) {
      searchHistoryMaxCountInput.value = currentSettings.searchHistory.maxCount || 10;
    }
```

在 `saveSettingsAndApply()` 函数中，构建 `updatedSettings` 的部分，添加 `searchHistory` 字段：

```js
      const updatedSettings = {
        ...currentSettings,
        syncPeerUrl: syncPeerUrl,
        compactMode: {
          ...((currentSettings && currentSettings.compactMode) || {}),
          enabled: compactModeEnabled,
          showUrl: showUrl,
          showDate: showDate,
          showTags: showTags,
          titleMaxChars: titleMaxChars,
          urlMaxChars: urlMaxChars
        },
        searchHistory: {
          maxCount: parseInt(searchHistoryMaxCountInput.value) || 10
        }
      };
```

在 `saveSettingsAndApply` 中持久化之后，如果 maxCount 变化，调用 `setMaxCount`：

```js
      // 更新搜索历史最大条数
      const newMaxCount = parseInt(searchHistoryMaxCountInput.value) || 10;
      setMaxCount(newMaxCount);
```

- [ ] **Step 3: 提交**

```bash
git add popup.html popup.js
git commit -m "feat: 设置对话框新增搜索历史最大条数配置"
```

---
