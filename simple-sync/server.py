#!/usr/bin/env python3
"""
轻量级同步服务器 - Flask 版本
支持密钥认证和数据加密
"""

import json
import hashlib
import os
import sys
import base64
from flask import Flask, request, jsonify
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

app = Flask(__name__)

# 数据文件路径
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'links.json')

# 存储结构: {hash: {"title": ..., "url": ..., "hash": ...}}
links_db = {}

# 密钥（从环境变量读取）
SYNC_SECRET = os.environ.get('SYNC_SECRET', '')


def check_secret():
    """检查密钥是否配置"""
    global SYNC_SECRET
    if not SYNC_SECRET:
        print("[error] 请设置环境变量 SYNC_SECRET")
        print("[error] 示例: export SYNC_SECRET=your_secret_key")
        sys.exit(1)
    print(f"[init] 密钥已配置")


def load_links():
    """从 JSON 文件加载链接"""
    global links_db
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                links_db = json.load(f)
            print(f"[init] 已加载 {len(links_db)} 条链接")
        except Exception as e:
            print(f"[init] 加载数据失败: {e}")


def save_links():
    """保存链接到 JSON 文件"""
    try:
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(links_db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[error] 保存数据失败: {e}")


def compute_hash(title: str, url: str) -> str:
    """计算 SHA-256 hash，内容为 title + '::' + url"""
    content = f"{title}::{url}"
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


# ===== 加密相关功能 =====

def derive_key(password: str) -> bytes:
    """用 SHA-256 直接从密码派生密钥"""
    return hashlib.sha256(password.encode('utf-8')).digest()


def encrypt(plaintext: str, password: str) -> dict:
    """AES-256-CBC 加密"""
    key = derive_key(password)
    iv = get_random_bytes(16)
    cipher = AES.new(key, AES.MODE_CBC, iv)

    # PKCS7 填充
    plaintext_bytes = plaintext.encode('utf-8')
    padding = 16 - (len(plaintext_bytes) % 16)
    padded = plaintext_bytes + bytes([padding] * padding)

    ciphertext = cipher.encrypt(padded)

    return {
        'iv': base64.b64encode(iv).decode('utf-8'),
        'data': base64.b64encode(ciphertext).decode('utf-8')
    }


def decrypt(encrypted: dict, password: str) -> str:
    """AES-256-CBC 解密"""
    key = derive_key(password)

    iv = base64.b64decode(encrypted['iv'])
    ciphertext = base64.b64decode(encrypted['data'])

    cipher = AES.new(key, AES.MODE_CBC, iv)
    padded = cipher.decrypt(ciphertext)

    # 移除 PKCS7 填充
    padding = padded[-1]
    if padding < 1 or padding > 16:
        raise ValueError(f"Invalid PKCS7 padding length: {padding}")
    if padded[-padding:] != bytes([padding] * padding):
        raise ValueError("Invalid PKCS7 padding bytes")
    plaintext = padded[:-padding].decode('utf-8')

    return plaintext




# 预设的验证字符串
AUTH_TOKEN = 'DUXIANG'


def verify_secret(encrypted_token, password: str) -> bool:
    """验证 Authorization 头中的加密 token 是否正确"""
    try:
        decrypted = decrypt({'iv': encrypted_token['iv'], 'data': encrypted_token['data']}, password)
        # strip() 移除填充的空格
        return decrypted.strip() == AUTH_TOKEN
    except Exception as e:
        print(f"[verify] 解密失败: {e}")
        return False


# ===== 中间件 =====

@app.after_request
def add_cors_headers(response):
    """手动添加 CORS 响应头"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


def verify_auth() -> tuple:
    """验证 Authorization 头（包含加密的 DUXIANG）"""
    global SYNC_SECRET

    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, 'Missing or invalid Authorization header'

    # 获取加密的 token（格式：{"iv": "...", "data": "..."}）
    try:
        encrypted_token = json.loads(auth_header[7:])  # 去掉 'Bearer ' 前缀
    except json.JSONDecodeError:
        return None, 'Invalid token format'

    # 用 SYNC_SECRET 解密，验证是否为 "DUXIANG"
    if not verify_secret(encrypted_token, SYNC_SECRET):
        return None, 'Invalid secret'

    return SYNC_SECRET, None


# ===== API 路由 =====

@app.route('/api/sync', methods=['POST'])
def handle_sync():
    """处理同步请求"""
    global SYNC_SECRET

    try:
        # 检查是否有 Authorization 头
        auth_header = request.headers.get('Authorization', '')
        has_auth = auth_header.startswith('Bearer ')

        # 验证密钥（如果客户端发送了 Authorization 头）
        secret = None
        if has_auth:
            secret, error = verify_auth()
            if error:
                print(f"[auth] 认证失败: {error}")
                return jsonify({'error': error}), 401
            print(f"[auth] 密钥验证通过")

        data = request.get_json() or {}

        # 解密请求体（如果有加密）
        if 'encrypted' in data:
            encrypted_data = data['encrypted']
            decrypted_str = decrypt(encrypted_data, secret or SYNC_SECRET)
            try:
                data = json.loads(decrypted_str)
            except json.JSONDecodeError as e:
                # 某些客户端实现可能会在尾部残留控制字符，先做一次安全裁剪再重试
                cleaned = decrypted_str.rstrip('\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f')
                if cleaned == decrypted_str:
                    raise
                data = json.loads(cleaned)
                print(f"[sync] 请求尾部存在控制字符，已自动裁剪并继续，原始长度={len(decrypted_str)}, 裁剪后={len(cleaned)}")
            print(f"[sync] 请求已解密")

        is_pull = data.get('pull', False)

        received_links = data.get('links', [])

        # 拉取模式：返回服务器上所有的链接
        if is_pull:
            all_links = list(links_db.values())
            print(f"[pull] 返回 {len(all_links)} 个链接")

            if secret:
                # 加密响应体
                response_data = {'links': all_links}
                encrypted = encrypt(json.dumps(response_data, ensure_ascii=False), secret)
                return jsonify({'encrypted': encrypted})
            else:
                return jsonify({'links': all_links})

        # 同步模式：保存客户端发来的新链接
        new_links = []
        for link in received_links:
            link_hash = link.get('hash')
            if not link_hash:
                link_hash = compute_hash(link.get('title', ''), link.get('url', ''))

            if link_hash not in links_db:
                links_db[link_hash] = {
                    'title': link.get('title', ''),
                    'url': link.get('url', ''),
                    'hash': link_hash
                }
                new_links.append(link_hash)

        if new_links:
            save_links()

        # 返回服务器有但客户端没有的链接
        client_hashes = set(link.get('hash') or compute_hash(link.get('title', ''), link.get('url', '')) for link in received_links)
        server_missing_for_client = [
            link for hash, link in links_db.items()
            if hash not in client_hashes
        ]

        print(f"[sync] 收到 {len(received_links)} 个链接，服务器新增 {len(new_links)} 个")

        if secret:
            # 加密响应体
            response_data = {'links': server_missing_for_client}
            encrypted = encrypt(json.dumps(response_data, ensure_ascii=False), secret)
            print(f"[sync] 返回 {len(server_missing_for_client)} 个链接（已加密）")
            return jsonify({'encrypted': encrypted})
        else:
            print(f"[sync] 返回 {len(server_missing_for_client)} 个链接")
            return jsonify({'links': server_missing_for_client})

    except Exception as e:
        print(f"[error] {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/verify', methods=['POST'])
def handle_verify():
    """验证密钥是否正确"""
    global SYNC_SECRET

    try:
        data = request.get_json() or {}
        encrypted_token = data.get('token', {})
        secret = data.get('secret', '')

        if not SYNC_SECRET:
            return jsonify({'error': 'Server not configured with SYNC_SECRET'}), 500

        if secret:
            # 直接验证密钥
            if verify_secret({'iv': '', 'data': ''}, secret):
                return jsonify({'valid': True})
            else:
                return jsonify({'valid': False}), 401

        if encrypted_token:
            # 验证加密的 token
            if verify_secret(encrypted_token, SYNC_SECRET):
                return jsonify({'valid': True})
            else:
                return jsonify({'valid': False}), 401

        return jsonify({'error': 'Missing token or secret'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/status', methods=['GET'])
def handle_status():
    """处理状态请求"""
    return jsonify({
        'links_count': len(links_db),
        'links': list(links_db.values())[:10]  # 只返回前10条
    })


@app.route('/', methods=['GET'])
def handle_index():
    """处理首页请求"""
    html = f"""
<!DOCTYPE html>
<html>
<head><title>Simple Sync Server</title></head>
<body>
<h1>Simple Sync Server</h1>
<p>已存储 {len(links_db)} 个链接</p>
<p><a href="/status">查看状态</a></p>
</body>
</html>
"""
    return html, 200, {'Content-Type': 'text/html; charset=utf-8'}


@app.route('/api/sync', methods=['OPTIONS'])
def handle_options():
    """处理预检请求"""
    return '', 200


def run_server(port=9616):
    """启动服务器"""
    check_secret()
    load_links()
    print(f"Simple Sync Server (Flask) started at http://localhost:{port}")
    print(f"  数据文件: {DATA_FILE}")
    print(f"  Sync endpoint: POST http://localhost:{port}/api/sync")
    print(f"  Status page:   GET http://localhost:{port}/status")
    print(f"  Verify endpoint: POST http://localhost:{port}/api/verify")
    app.run(host='0.0.0.0', port=port, threaded=True)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9616
    run_server(port)
