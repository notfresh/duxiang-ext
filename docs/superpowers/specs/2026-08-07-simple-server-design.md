# 轻量级同步服务器设计

## 概述

实现一个最简单的 Python 3 同步服务器，支持简单双向同步协议，无需外部依赖。

## 功能需求

- 接收客户端发送的链接数组（含 hash）
- 存储收到的链接
- 返回服务器没有的链接（让客户端去创建）
- 提供状态查看接口

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
  ]
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

- Python 3 内置模块
- `http.server` - 内置 HTTP 服务器
- `hashlib` - SHA-256 计算
- `json` - JSON 处理

### 存储

内存字典存储：`{hash: {title, url, hash}}`

### 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sync` | POST | 同步接口 |
| `/status` | GET | 查看状态 |
| `/` | GET | 首页 |

## 实现步骤

1. 使用 `http.server.HTTPServer` 创建服务器
2. 实现 `BaseHTTPRequestHandler` 处理请求
3. 内存存储链接数据
4. 支持状态查看
