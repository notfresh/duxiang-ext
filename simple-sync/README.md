# Simple Sync Server

轻量级双向同步服务器，基于 Flask。

## 快速开始

### 1. 安装依赖

```bash
pip install flask pycryptodome
```

### 2. 启动服务器

```powershell
# Windows PowerShell
$env:SYNC_SECRET = "your_secret_key"
python server.py
```

```bash
# Linux/Mac
export SYNC_SECRET="your_secret_key"
python server.py
```

scp server.py root@47.80.28.245:/root/projects/duxiang-sync/

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
  ]
}
```

响应：
```json
{
  "links": [
    { "title": "标题", "url": "https://...", "hash": "sha256值" }
  ]
}
```

### 加密模式

当请求头包含 `Authorization: Bearer <加密的DUXIANG>` 时，使用加密传输：

**请求头**
```
Authorization: Bearer {"iv": "...", "data": "..."}
```

**请求体**
```json
{
  "encrypted": {
    "iv": "xxx",
    "data": "xxx"
  }
}
```

**响应体**
```json
{
  "encrypted": {
    "iv": "xxx",
    "data": "xxx"
  }
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

---

## 加密说明

- **算法**: AES-256-CBC
- **密钥派生**: SHA-256(密码)
- **填充**: PKCS7
- **验证**: 请求头带加密的 "DUXIANG"，服务器解密验证

---

## 本地/局域网

访问 `localhost`、`127.0.0.1` 或 `192.168.x.x` 时可以不加密。
