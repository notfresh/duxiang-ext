#!/usr/bin/env python3
"""
轻量级同步服务器 - Flask 版本
"""
import json
import hashlib
import os
from flask import Flask, request, jsonify

app = Flask(__name__)

# 数据文件路径
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'links.json')
DELETED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deleted.json')

# 存储结构: {hash: {"title": ..., "url": ..., "hash": ...}}
links_db = {}

# 已删除的 hash 集合
deleted_hashes = set()


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


def load_deleted():
    """从 JSON 文件加载已删除的 hash"""
    global deleted_hashes
    if os.path.exists(DELETED_FILE):
        try:
            with open(DELETED_FILE, 'r', encoding='utf-8') as f:
                deleted_hashes = set(json.load(f))
            print(f"[init] 已加载 {len(deleted_hashes)} 条删除记录")
        except Exception as e:
            print(f"[init] 加载删除记录失败: {e}")


def save_deleted():
    """保存已删除的 hash 到 JSON 文件"""
    try:
        with open(DELETED_FILE, 'w', encoding='utf-8') as f:
            json.dump(list(deleted_hashes), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[error] 保存删除记录失败: {e}")


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


# ===== 中间件 =====

@app.after_request
def add_cors_headers(response):
    """手动添加 CORS 响应头"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# ===== API 路由 =====

@app.route('/api/sync', methods=['POST'])
def handle_sync():
    """处理同步请求"""
    global deleted_hashes

    try:
        data = request.get_json() or {}
        is_pull = data.get('pull', False)
        received_links = data.get('links', [])
        received_deleted = data.get('deleted_hashes', [])

        # 处理客户端发来的删除记录
        if received_deleted:
            for h in received_deleted:
                if h in links_db:
                    del links_db[h]
                deleted_hashes.add(h)
            save_links()
            save_deleted()
            print(f"[sync] 处理了 {len(received_deleted)} 条删除记录")

        # 拉取模式：返回服务器上所有的链接
        if is_pull:
            all_links = list(links_db.values())
            print(f"[pull] 返回 {len(all_links)} 个链接")
            return jsonify({'links': all_links, 'deleted_hashes': list(deleted_hashes)})

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
        # 排除已删除的
        client_hashes = client_hashes | set(received_deleted)
        server_missing_for_client = [
            link for hash, link in links_db.items()
            if hash not in client_hashes
        ]

        # 获取服务器的删除记录（客户端没有的）
        server_deleted = list(deleted_hashes - set(received_deleted))

        print(f"[sync] 收到 {len(received_links)} 个链接，服务器新增 {len(new_links)} 个")
        print(f"[sync] 返回 {len(server_missing_for_client)} 个链接，{len(server_deleted)} 条删除记录")
        return jsonify({
            'links': server_missing_for_client,
            'deleted_hashes': server_deleted
        })

    except Exception as e:
        print(f"[error] {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def handle_status():
    """处理状态请求"""
    return jsonify({
        'links_count': len(links_db),
        'deleted_count': len(deleted_hashes),
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
    load_links()
    load_deleted()
    print(f"Simple Sync Server (Flask) started at http://localhost:{port}")
    print(f"  数据文件: {DATA_FILE}")
    print(f"  删除记录: {DELETED_FILE}")
    print(f"  Sync endpoint: POST http://localhost:{port}/api/sync")
    print(f"  Status page:   GET http://localhost:{port}/status")
    app.run(host='0.0.0.0', port=port, threaded=True)


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9616
    run_server(port)
