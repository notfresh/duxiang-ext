# 轻量级双向同步功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个轻量级的双向同步功能，点击同步按钮时上传本地所有链接到服务器，服务器返回它没有的链接，本地创建这些链接。

**Architecture:** 新增 simple-sync.js 模块处理同步逻辑，在 background.js 添加消息处理，修改 popup.js 的同步按钮使用新逻辑。

**Tech Stack:** JavaScript (ES6+), IndexedDB, Chrome Extension APIs

---

## 文件结构

- 创建: `js/simple-sync.js` - 核心同步逻辑
- 修改: `background.js` - 添加 simple-sync 消息处理
- 修改: `popup.js` - 同步按钮改用新的 simple-sync

---

## 实现步骤

### Task 1: 创建 js/simple-sync.js 核心同步模块

**Files:**
- Create: `js/simple-sync.js`

- [ ] **Step 1: 创建 simple-sync.js 文件，实现核心同步逻辑**

```javascript
/**
 * 轻量级双向同步模块
 * 上传本地所有链接到服务器，获取服务器没有的链接并创建到本地
 */

import { getAllLinks, addLink } from './storage.js';

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
  const allLinks = await getAllLinks();
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
```

- [ ] **Step 2: 提交创建 simple-sync.js**

---

### Task 2: 修改 background.js 添加消息处理

**Files:**
- Modify: `background.js`

- [ ] **Step 1: 在 background.js 中添加 simple-sync 消息处理**

在现有消息处理代码中添加新的 simple-sync 类型处理。在 `chrome.runtime.onMessage.addListener` 回调中，在现有 `sync.push` 处理之后添加：

```javascript
// 轻量级双向同步
if (message.type === 'simple-sync') {
  (async () => {
    try {
      const { simpleSync } = await import('./js/simple-sync.js');
      const settings = await import('./js/settings.js');
      const userSettings = await settings.loadSettings();
      const peerUrl = userSettings.syncPeerUrl;
      
      if (!peerUrl) {
        sendResponse({ success: false, message: '请先配置服务器地址' });
        return;
      }
      
      const result = await simpleSync(peerUrl);
      sendResponse(result);
    } catch (e) {
      console.error('[background] simple-sync error', e);
      sendResponse({ success: false, message: e.message });
    }
  })();
  return true;
}
```

- [ ] **Step 2: 提交修改**

---

### Task 3: 修改 popup.js 同步按钮逻辑

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: 找到同步推送按钮的处理代码并修改**

找到现有的 syncPushBtn 点击事件处理（约在第 1767-1788 行），将 `sync.push` 消息类型改为 `simple-sync`：

修改前：
```javascript
const res = await chrome.runtime.sendMessage({ type: 'sync.push', peerId: peerUrl, entityType: 'LINK' });
```

修改后：
```javascript
const res = await chrome.runtime.sendMessage({ type: 'simple-sync' });
```

同时修改状态显示文案：
- "正在推送..." → "正在同步..."
- "推送成功" → "同步成功"
- "推送失败" → "同步失败"

- [ ] **Step 2: 提交修改**

---

### Task 4: 测试同步功能

**Files:**
- Test: 手动测试

- [ ] **Step 1: 配置服务器地址并测试同步**

1. 在设置页面配置 syncPeerUrl（如 `http://localhost:8080`）
2. 确保服务器端有 `/api/sync` 接口可接受 POST 请求并返回缺失链接
3. 点击同步按钮
4. 检查控制台输出和页面状态显示

- [ ] **Step 2: 验证链接创建**

1. 同步后检查本地是否成功创建了新链接
2. 验证创建时间为当前时间

---

## 验收标准

1. 点击同步按钮后，发送本地所有链接到服务器
2. 服务器返回的链接正确创建到本地
3. 使用 hash(url+title) 正确去重，不会重复创建
4. 错误处理正确，状态提示清晰
