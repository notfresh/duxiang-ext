/**
 * 搜索历史缓存模块
 * 使用 chrome.storage.local 存储，支持 LRU 淘汰和 pin（固定）功能
 */

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
 * 对条目排序：pinned 在前，非 pinned 在后，各自内部按 lastUsed 倒序
 */
function sortItems(items) {
  const pinned = items.filter(i => i.pinned).sort((a, b) => b.lastUsed - a.lastUsed);
  const unpinned = items.filter(i => !i.pinned).sort((a, b) => b.lastUsed - a.lastUsed);
  return [...pinned, ...unpinned];
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
