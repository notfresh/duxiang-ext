/**
 * 轻量级双向同步模块
 * 上传本地所有链接到服务器，获取服务器没有的链接并创建到本地
 */

import { loadLinks, addLink } from './storage.js';

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

  const apiUrl = `${peerUrl.replace(/\/$/, '')}/api/sync`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ links: linksWithHash })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, links: data.links || [] };
  } catch (error) {
    console.error('[simple-sync] 请求失败:', error);
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
      await addLink({
        title: link.title,
        url: link.url,
        timestamp: new Date().toISOString()
      });
      createdCount++;
    }
  }

  return createdCount;
}

/**
 * 执行完整同步流程
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
