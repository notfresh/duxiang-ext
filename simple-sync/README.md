# Simple Sync Server

轻量级双向同步服务器，基于 Flask。

## 快速开始

### 1. 安装依赖

```bash
pip install flask
```

### 2. 启动服务器

```bash
python server.py
```

默认端口：**9616**

### 3. 访问

- 首页：http://localhost:9616/
- 状态：http://localhost:9616/status

---

## API 接口

### 同步接口

**POST** `/api/sync`

请求：
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" }
  ],
  "deleted_hashes": ["hash1", "hash2", ...]
}
```

响应：
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" }
  ],
  "deleted_hashes": ["hash1", "hash2", ...]
}
```

### 状态接口

**GET** `/status`

响应：
```json
{
  "links_count": 100,
  "links": [...]
}
```
