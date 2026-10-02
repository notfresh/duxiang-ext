/**
 * 轻量级双向同步模块
 * 上传本地所有链接到服务器，获取服务器没有的链接并创建到本地
 */

import { loadLinks, addLink, getDeletedHashes, removeDeletedHashes, deleteLinkByHash } from './storage.js';

/**
 * 使用 SHA-256 计算 hash（浏览器内置 Web Crypto API，无需外部依赖）
 * @param {string} content - 要 hash 的内容
 * @returns {Promise<string>} 16 进制 hash 字符串
 */
async function computeSHA256(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 计算 url + title 的 hash 值用于唯一性判断
 * 用 :: 作为分隔符避免 title=a + url=bc 和 title=ab + url=c 产生相同结果
 * @param {string} url
 * @param {string} title
 * @returns {Promise<string>} hash 值
 */
async function computeHash(url, title) {
  const content = (title || '') + '::' + (url || '');
  return await computeSHA256(content);
}

/**
 * 获取本地所有链接的 title + url 列表
 * @returns {Promise<Array<{title: string, url: string}>>}
 */
async function getLocalLinks() {
  const allLinks = await loadLinks();
  console.log('[simple-sync] getLocalLinks 加载到', allLinks.length, '条链接');
  console.log('[simple-sync] 链接列表:', allLinks);
  return allLinks.map(link => ({
    title: link.title,
    url: link.url
  }));
}

/**
 * 发起同步请求
 * @param {string} peerUrl - 服务器地址
 * @returns {Promise<{success: boolean, links?: Array, error?: string}>}
 */
async function syncWithServer(peerUrl) {
  // 获取本地所有链接
  const localLinks = await getLocalLinks();

  // 发送到服务器（带上 hash 以便服务器去重）
  const linksWithHash = await Promise.all(
    localLinks.map(async link => ({
      title: link.title,
      url: link.url,
      hash: await computeHash(link.url, link.title)
    }))
  );

  // 获取本地删除记录
  const deletedHashes = await getDeletedHashes();
  console.log('[simple-sync] 本地删除记录:', deletedHashes.length, '条');

  const apiUrl = `${peerUrl.replace(/\/$/, '')}/api/sync`;

  console.log('[simple-sync] 开始同步，请求URL:', apiUrl);
  console.log('[simple-sync] 链接数量:', linksWithHash.length);

  // 15秒超时（大数据量需要更长时间）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const requestData = {
    links: linksWithHash,
    deleted_hashes: deletedHashes
  };

  const body = JSON.stringify(requestData);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    const links = data.links || [];
    const serverDeletedHashes = data.deleted_hashes || [];

    console.log('[simple-sync] 收到服务器返回的链接数量:', links.length);
    console.log('[simple-sync] 服务器删除记录:', serverDeletedHashes.length, '条');

    // 处理服务器的删除记录
    for (const hash of serverDeletedHashes) {
      await deleteLinkByHash(hash);
    }

    // 清除本地已同步的删除记录
    if (deletedHashes.length > 0) {
      await removeDeletedHashes(deletedHashes);
      console.log('[simple-sync] 已清除本地删除记录');
    }

    console.log('[simple-sync] 服务器返回的链接:', links);
    return { success: true, links };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[simple-sync] 请求失败:', error);
    console.error('[simple-sync] 错误类型:', error.name);
    console.error('[simple-sync] 错误消息:', error.message);
    if (error.name === 'AbortError') {
      // 检查是否是超时
      if (error.message && error.message.includes('aborted')) {
        return { success: false, error: '同步超时，请检查网络连接' };
      }
      return { success: false, error: `请求被中止: ${error.message}` };
    }
    return { success: false, error: error.message };
  }
}

/**
 * 将服务器返回的链接同步到本地
 * @param {Array<{title: string, url: string}>} links
 * @returns {Promise<number>} 创建的链接数量
 */
async function syncLinksToLocal(links) {
  if (!links || links.length === 0) {
    return 0;
  }

  // 获取本地所有链接用于去重检查
  const localLinks = await getLocalLinks();
  // computeHash 是 async，需要用 Promise.all 处理
  const localHashes = await Promise.all(localLinks.map(l => computeHash(l.url, l.title)));
  const localHashSet = new Set(localHashes);

  let createdCount = 0;

  for (const link of links) {
    const hash = await computeHash(link.url, link.title);

    // 检查本地是否已存在
    if (!localHashSet.has(hash)) {
      // 创建新链接
      try {
        await addLink({
          title: link.title,
          url: link.url,
          timestamp: new Date().toISOString()
        });
        createdCount++;
      } catch (error) {
        console.error('[simple-sync] 添加链接失败，继续同步下一条:', link, error);
      }
    }
  }

  return createdCount;
}

/**
 * 执行完整同步流程（双向）
 * @param {string} peerUrl - 服务器地址
 * @returns {Promise<{success: boolean, message: string, createdCount?: number}>}
 */
export async function simpleSync(peerUrl) {
  if (!peerUrl) {
    return { success: false, message: '请先配置服务器地址' };
  }

  // 发起同步请求
  const result = await syncWithServer(peerUrl);

  if (!result.success) {
    return { success: false, message: `同步失败: ${result.error}` };
  }

  // 同步返回的链接到本地
  const createdCount = await syncLinksToLocal(result.links);

  return {
    success: true,
    message: `同步成功，已创建 ${createdCount} 个新链接`,
    createdCount
  };
}

/**
 * 发起拉取请求（单向，只获取服务器上的链接）
 * @param {string} peerUrl - 服务器地址
 * @returns {Promise<{success: boolean, links?: Array, error?: string}>}
 */
async function pullFromServer(peerUrl) {
  const apiUrl = `${peerUrl.replace(/\/$/, '')}/api/sync`;

  // 获取本地删除记录
  const deletedHashes = await getDeletedHashes();

  console.log('[simple-sync] 开始拉取，请求URL:', apiUrl);

  const requestData = {
    links: [],
    pull: true,
    deleted_hashes: deletedHashes
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    const links = data.links || [];
    const serverDeletedHashes = data.deleted_hashes || [];

    console.log('[simple-sync] 收到服务器返回的链接数量:', links.length);
    console.log('[simple-sync] 服务器删除记录:', serverDeletedHashes.length, '条');

    // 处理服务器的删除记录
    for (const hash of serverDeletedHashes) {
      await deleteLinkByHash(hash);
    }

    // 清除本地已同步的删除记录
    if (deletedHashes.length > 0) {
      await removeDeletedHashes(deletedHashes);
    }

    console.log('[simple-sync] 服务器返回的链接:', links);
    return { success: true, links };
  } catch (error) {
    console.error('[simple-sync] 拉取请求失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 执行拉取流程（单向）
 * @param {string} peerUrl - 服务器地址
 * @returns {Promise<{success: boolean, message: string, createdCount?: number}>}
 */
export async function simplePull(peerUrl) {
  if (!peerUrl) {
    return { success: false, message: '请先配置服务器地址' };
  }

  // 从服务器拉取链接
  const result = await pullFromServer(peerUrl);

  if (!result.success) {
    return { success: false, message: `拉取失败: ${result.error}` };
  }

  // 同步返回的链接到本地
  const createdCount = await syncLinksToLocal(result.links);

  return {
    success: true,
    message: `拉取成功，已创建 ${createdCount} 个新链接`,
    createdCount
  };
}
