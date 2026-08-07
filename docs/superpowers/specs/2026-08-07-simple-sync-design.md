# 轻量级双向同步功能设计

## 概述

实现一个简单轻量的双向同步功能：点击同步按钮时，上传本地所有链接到配置的服务器，服务器返回它没有的链接，本地检查并创建。

## 功能需求

- 用户点击同步按钮，触发双向同步
- 上传本地所有链接的 title + url 到服务器
- 服务器返回它没有的链接
- 本地用 hash(url+title) 检查，本地没有的链接创建到本地

## 技术设计

### API 约定

**请求**
- URL: `{syncPeerUrl}/api/sync`
- Method: POST
- Body:
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" },
    ...
  ]
}
```
发送时带上 SHA-256 hash（内容为 `title + "::" + url`），便于服务器去重。

**响应**
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" },
    ...
  ]
}
```
返回的是服务器没有的链接（基于 hash 判断）。

### 唯一性判断

使用简单的 hash 函数：`hash(url + title)` 的结果作为唯一标识。

### 存储

链接存储到现有的 `links` 表（IndexedDB），创建时间设置为当前时间。

### 消息通道

- popup.js 发送消息到 background.js
- background.js 处理同步逻辑

## 文件变更

1. **js/simple-sync.js**（新增）
   - `syncAll()` 函数：获取本地所有链接，发起同步请求，处理响应

2. **background.js**（修改）
   - 添加 `simple-sync` 消息处理，调用 simple-sync.js

3. **popup.js**（修改）
   - 同步按钮改用新的 simple-sync

4. **js/settings.js**（可选）
   - 如果需要，可添加同步相关设置项

## 实现步骤

1. 创建 js/simple-sync.js，实现核心同步逻辑
2. 在 background.js 添加消息处理
3. 修改 popup.js 的同步按钮逻辑
4. 测试同步功能
