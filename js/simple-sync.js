/**
 * 轻量级双向同步模块
 * 上传本地所有链接到服务器，获取服务器没有的链接并创建到本地
 */

import { loadLinks, addLink } from './storage.js';

// 预设的认证 token
const AUTH_TOKEN = 'DUXIANG';

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

// ===== 加密相关功能 =====

/**
 * 从密码派生 AES-256 密钥
 * @param {string} password
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password) {
  const encoder = new TextEncoder();
  const keyData = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-CBC', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * AES-256-CBC 加密
 * @param {string} plaintext
 * @param {string} password
 * @returns {Promise<{iv: string, data: string}>}
 */
async function encrypt(plaintext, password) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();

  // PKCS7 填充
  const data = encoder.encode(plaintext);
  const padLen = 16 - (data.length % 16);
  // 当数据刚好是16的倍数时，需要填充16个字节
  const actualPadLen = padLen === 0 ? 16 : padLen;
  const padded = new Uint8Array(data.length + actualPadLen);
  padded.set(data);
  // 填充 padLen 字节（值为 padLen 本身）
  for (let i = 0; i < actualPadLen; i++) {
    padded[data.length + i] = actualPadLen;
  }

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv },
    key,
    padded
  );

  // 转 Base64（使用 reduce 避免大数组时的栈溢出）
  const ivArray = new Uint8Array(iv);
  const cipherArray = new Uint8Array(ciphertext);
  return {
    iv: btoa(ivArray.reduce((acc, byte) => acc + String.fromCharCode(byte), '')),
    data: btoa(cipherArray.reduce((acc, byte) => acc + String.fromCharCode(byte), ''))
  };
}

/**
 * AES-256-CBC 解密
 * @param {{iv: string, data: string}} encrypted
 * @param {string} password
 * @returns {Promise<string>}
 */
async function decrypt(encrypted, password) {
  const key = await deriveKey(password);

  // Base64 解码
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv },
    key,
    ciphertext
  );

  // PKCS7 去填充
  const arr = new Uint8Array(decrypted);
  const padLen = arr[arr.length - 1];
  if (padLen < 1 || padLen > 16) {
    throw new Error(`Invalid PKCS7 padding length: ${padLen}`);
  }
  for (let i = arr.length - padLen; i < arr.length; i++) {
    if (arr[i] !== padLen) {
      throw new Error('Invalid PKCS7 padding bytes');
    }
  }
  const unpadded = arr.slice(0, arr.length - padLen);

  return new TextDecoder().decode(unpadded);
}

/**
 * 判断是否需要加密
 * 本地/局域网不加密，公网需要加密
 * @param {string} url
 * @returns {boolean}
 */
function shouldEncrypt(url) {
  return false; // TODO 统一先不加密
  // try {
  //   const host = new URL(url).hostname;
  //   return !(host === 'localhost' ||
  //            host === '127.0.0.1' ||
  //            host.startsWith('192.168.'));
  // } catch (e) {
  //   return true; // 默认加密
  // }
}

/**
 * 加密 Authorization 头用的 token
 * @param {string} password
 * @returns {Promise<{iv: string, data: string}>}
 */
async function encryptAuthToken(password) {
  // encrypt() 内部会做 PKCS7 填充
  return encrypt(AUTH_TOKEN, password);
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
 * @param {string} secret - 同步密钥
 * @returns {Promise<{success: boolean, links?: Array, error?: string}>}
 */
async function syncWithServer(peerUrl, secret = '') {
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
  const useEncryption = secret && shouldEncrypt(peerUrl);

  console.log('[simple-sync] 开始同步，请求URL:', apiUrl);
  console.log('[simple-sync] 链接数量:', linksWithHash.length);
  console.log('[simple-sync] 使用加密:', useEncryption);

  // 15秒超时（大数据量需要更长时间）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const headers = {
    'Content-Type': 'application/json'
  };

  let body;

  if (useEncryption) {
    // 加密请求体
    const encryptedAuth = await encryptAuthToken(secret);
    headers['Authorization'] = `Bearer ${JSON.stringify(encryptedAuth)}`;

    const requestData = JSON.stringify({ links: linksWithHash });
    const encryptedBody = await encrypt(requestData, secret);
    body = JSON.stringify({ encrypted: encryptedBody });
    console.log('[simple-sync] 请求已加密');
  } else {
    body = JSON.stringify({ links: linksWithHash });
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    let links = [];

    if (data.encrypted) {
      // 解密响应
      const decrypted = await decrypt(data.encrypted, secret);
      const parsed = JSON.parse(decrypted);
      links = parsed.links || [];
      console.log('[simple-sync] 响应已解密');
    } else {
      links = data.links || [];
    }

    console.log('[simple-sync] 收到服务器返回的链接数量:', links.length);
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
/**
 * 执行完整同步流程（双向）
 * @param {string} peerUrl - 服务器地址
 * @param {string} secret - 同步密钥
 * @returns {Promise<{success: boolean, message: string, createdCount?: number}>}
 */
export async function simpleSync(peerUrl, secret = '') {
  if (!peerUrl) {
    return { success: false, message: '请先配置服务器地址' };
  }

  // 发起同步请求
  const result = await syncWithServer(peerUrl, secret);

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
/**
 * 发起拉取请求（单向，只获取服务器上的链接）
 * @param {string} peerUrl - 服务器地址
 * @param {string} secret - 同步密钥
 * @returns {Promise<{success: boolean, links?: Array, error?: string}>}
 */
async function pullFromServer(peerUrl, secret = '') {
  const apiUrl = `${peerUrl.replace(/\/$/, '')}/api/sync`;
  const useEncryption = secret && shouldEncrypt(peerUrl);

  console.log('[simple-sync] 开始拉取，请求URL:', apiUrl);
  console.log('[simple-sync] 使用加密:', useEncryption);

  const headers = {
    'Content-Type': 'application/json'
  };

  let body;

  if (useEncryption) {
    // 加密请求体
    const encryptedAuth = await encryptAuthToken(secret);
    headers['Authorization'] = `Bearer ${JSON.stringify(encryptedAuth)}`;

    const requestData = JSON.stringify({ links: [], pull: true });
    const encryptedBody = await encrypt(requestData, secret);
    body = JSON.stringify({ encrypted: encryptedBody });
    console.log('[simple-sync] 请求已加密');
  } else {
    body = JSON.stringify({ links: [], pull: true });
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    let links = [];

    if (data.encrypted) {
      // 解密响应
      const decrypted = await decrypt(data.encrypted, secret);
      const parsed = JSON.parse(decrypted);
      links = parsed.links || [];
      console.log('[simple-sync] 响应已解密');
    } else {
      links = data.links || [];
    }

    console.log('[simple-sync] 收到服务器返回的链接数量:', links.length);
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
/**
 * 执行拉取流程（单向）
 * @param {string} peerUrl - 服务器地址
 * @param {string} secret - 同步密钥
 * @returns {Promise<{success: boolean, message: string, createdCount?: number}>}
 */
export async function simplePull(peerUrl, secret = '') {
  if (!peerUrl) {
    return { success: false, message: '请先配置服务器地址' };
  }

  // 从服务器拉取链接
  const result = await pullFromServer(peerUrl, secret);

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
