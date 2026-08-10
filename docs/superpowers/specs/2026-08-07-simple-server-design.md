# 轻量级同步服务器设计（Flask 版）

## 概述

将现有的 `http.server` 实现迁移到 Flask 框架，保持完全相同的功能和行为，同时享受 Flask 带来的简洁性和可扩展性。

## 功能需求

- 接收客户端发送的链接数组（含 hash）
- 存储收到的链接到 JSON 文件
- 返回服务器没有的链接（让客户端去创建）
- 提供状态查看接口
- 提供首页

## 技术设计

### 协议约定

**请求**
- URL: `/api/sync`
- Method: POST
- Body:
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" },
    ...
  ],
  "pull": false  // 可选，为 true 时表示拉取模式
}
```

**响应**
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" },
    ...
  ]
}
```

### 技术栈

- Flask - Web 框架
- `hashlib` - SHA-256 计算
- `json` - JSON 处理

### 存储

内存字典存储：`{hash: {title, url, hash}}`，持久化到 `links.json`

### 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sync` | POST | 同步接口 |
| `/status` | GET | 查看状态 |
| `/` | GET | 首页 |

## 实现步骤

1. 创建 Flask 应用
2. 实现同步路由 `/api/sync`
3. 实现状态路由 `/status`
4. 实现首页路由 `/`
5. 迁移数据层（load_links, save_links, compute_hash）
6. 添加 CORS 支持
7. 创建 requirements.txt
