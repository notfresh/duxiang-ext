# 轻量级双向同步功能设计

## 概述

实现一个简单轻量的双向同步功能：点击同步按钮时，上传本地所有链接到配置的服务器，服务器返回它没有的链接，本地检查并创建。

## 功能需求

- 用户点击同步按钮，触发双向同步
- 上传本地所有链接的 title + url 到服务器
- 服务器返回它没有的链接
- 本地用 hash(url+title) 检查唯一性，本地没有的链接创建到本地

---

## 同步协议

### 核心思路

**原则：服务器返回客户端缺少的内容，而不是服务器缺少的内容**

- 客户端上传自己本地的所有链接（含 hash）
- 服务器保存客户端发来的新链接
- 服务器返回自己拥有但该客户端没有的链接
- 客户端将服务器返回的链接创建到本地

### 数据结构

#### 链接对象
```json
{
  "title": "链接标题",
  "url": "https://example.com",
  "hash": "sha256(title::url)"
}
```

#### Hash 计算规则
```
hash = SHA256(title + "::" + url)
```
使用 `::` 分隔符避免 title=a + url=bc 和 title=ab + url=c 产生相同 hash。

### API 接口

#### 同步接口

**请求**
- URL: `/api/sync`
- Method: POST
- Content-Type: `application/json`

```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" }
  ],
  "deleted_hashes": ["hash1", "hash2", ...]
}
```

**响应**
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" }
  ],
  "deleted_hashes": ["hash1", "hash2", ...]
}
```

#### 状态接口

- URL: `/status`
- Method: GET

**响应**
```json
{
  "links_count": 2500,
  "links": [...]
}
```

### 同步示例

| 场景 | 服务器 | 客户端 | 同步后 |
|------|--------|--------|--------|
| 空服务器 + 有数据客户端 | 0条 | 100条 | 服务器保存100条，客户端不变 |
| 有数据服务器 + 空客户端 | 100条 | 0条 | 服务器返回100条，客户端创建100条 |
| 双方有部分重叠 | 100条 | 80条(50条相同) | 服务器保存30条新链接，客户端创建50条 |

### 删除同步

**删除记录存储：**
- 客户端：IndexedDB 新增 `deleted_hashes` 表，存储已删除链接的 hash
- 服务器：内存 + JSON 文件持久化 `deleted_hashes` 集合

**同步流程：**
1. 客户端发送 `deleted_hashes` 数组给服务器
2. 服务器收到后，从数据库中删除对应的链接
3. 服务器返回 `deleted_hashes` 数组（服务器上的删除记录）
4. 客户端收到后，从本地数据库中删除对应链接，并从 `deleted_hashes` 中移除

**数据格式：**
```json
{
  "links": [...],
  "deleted_hashes": ["hash1", "hash2", ...]
}
```

---

## 网页插件端的技术设计

### 存储

链接存储到现有的 `links` 表（IndexedDB），创建时间设置为当前时间。

### 消息通道

- popup.js 发送消息到 background.js
- background.js 处理同步逻辑

### 文件变更

1. **js/simple-sync.js**（新增）
   - `simpleSync()` 函数：获取本地所有链接，发起同步请求，处理响应

2. **background.js**（修改）
   - 添加 `simple-sync` 消息处理，调用 simple-sync.js

3. **popup.js**（修改）
   - 同步按钮改用新的 simple-sync

---

## 实现步骤

1. 创建 js/simple-sync.js，实现核心同步逻辑
2. 在 background.js 添加消息处理
3. 修改 popup.js 的同步按钮逻辑
4. 测试同步功能

---

## 配置方式

### 服务端
```bash
python server.py
```

默认端口：**9616**

### 客户端
- 在插件设置页面配置服务器地址
