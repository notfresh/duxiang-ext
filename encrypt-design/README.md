# 跨语言加密测试

用于验证 Python (Flask 服务器) 和 JavaScript (浏览器插件) 之间的 AES-256-CBC 加密互通。

## 加密设计

### 算法
- **加密算法**: AES-256-CBC
- **密钥派生**: SHA-256(password)
- **填充方式**: PKCS7
- **编码**: Base64

### 数据格式
```json
{
  "iv": "Base64编码的16字节IV",
  "data": "Base64编码的密文"
}
```

### 密钥验证（简化方案）

请求头带加密的验证字符串，服务器用约定密钥解密，验证通过后再解密请求体。

```
┌─────────────────────────────────────────────────────┐
│ 请求头: Authorization: Bearer <加密的"DUXIANG">    │
│ 请求体: { "iv": "xxx", "data": "加密的内容" }     │
└─────────────────────────────────────────────────────┘
```

**流程：**

1. 双方约定密钥：`SYNC_SECRET`
2. **客户端**：请求头 = encrypt("DUXIANG", 密钥)
3. **服务器**：解密请求头 → 得到 "DUXIANG" → 验证通过 → 解密请求体

**验证原理：** 解密请求头成功 = 密钥正确 = 请求合法

### 密钥派生 (Python)
```python
import hashlib
key = hashlib.sha256(password.encode('utf-8')).digest()
```

### 密钥派生 (JS)
```javascript
const keyData = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-CBC", length: 256 }, false, ["encrypt", "decrypt"]);
```

## 文件说明

| 文件 | 用途 |
|------|------|
| `generate_server_data.py` | Python 生成加密数据 |
| `read_client_data.py` | Python 读取并解密 client_data.json |
| `server_data.json` | 包含原始数据和加密数据 |
| `test_full.html` | 完整测试：Python 加密 → JS 解密 |
| `client_test.html` | JS 加密生成 client_data.json |

## 测试步骤

### 1. 安装依赖
```bash
pip install -r requirements.txt
```

### 2. Python 加密测试
```bash
python generate_server_data.py
```
生成 `server_data.json`，包含测试数据和对应的加密结果。

### 3. JS 解密测试
在浏览器中打开 `test_full.html`，验证 JS 能否解密 Python 加密的数据。

### 4. 完整往返测试 (可选)

**JS 端:**
1. 打开 `client_test.html`
2. 点击「下载 client_data.json」

**Python 端:**
```bash
python read_client_data.py
```

## 依赖

- Python: `pycryptodome`
- 浏览器: 原生 Web Crypto API (无需额外依赖)
