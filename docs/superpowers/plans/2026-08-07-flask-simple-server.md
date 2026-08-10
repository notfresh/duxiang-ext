# Flask 简单同步服务器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的 http.server 实现迁移到 Flask 框架，保持完全相同的功能

**Architecture:** 使用 Flask 框架重构 HTTP 处理逻辑，数据层保持不变

**Tech Stack:** Flask, hashlib, json

---

### Task 1: 创建 requirements.txt

**Files:**
- Create: `simple-sync/requirements.txt`

- [ ] **Step 1: 创建 requirements.txt 文件**

```text
Flask>=2.0.0
```

---

### Task 2: 实现 Flask 服务器

**Files:**
- Create: `simple-sync/server.py`
- Delete: `simple-sync/simple-server.py`（可选，保留作为备份）

- [ ] **Step 1: 编写 Flask 服务器代码**

```python
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

# 存储结构: {hash: {"title": ..., "url": ..., "hash": ...}}
links_db = {}


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


@app.after_request
def add_cors_headers(response):
    """添加 CORS 头"""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


@app.route('/api/sync', methods=['POST'])
def handle_sync():
    """处理同步请求"""
    try:
        print(f"[sync] 收到请求")
        data = request.get_json() or {}

        is_pull = data.get('pull', False)
        received_links = data.get('links', [])

        # 拉取模式：返回服务器上所有的链接
        if is_pull:
            all_links = list(links_db.values())
            print(f"[pull] 返回 {len(all_links)} 个链接")
            return jsonify({'links': all_links})

        # 同步模式：找出服务器没有的链接并保存
        missing_links = []
        for link in received_links:
            link_hash = link.get('hash')
            if not link_hash:
                # 如果没有 hash 自己计算
                link_hash = compute_hash(link.get('title', ''), link.get('url', ''))

            if link_hash not in links_db:
                # 服务器没有这个链接，保存并返回
                links_db[link_hash] = {
                    'title': link.get('title', ''),
                    'url': link.get('url', ''),
                    'hash': link_hash
                }
                missing_links.append({
                    'title': link.get('title', ''),
                    'url': link.get('url', ''),
                    'hash': link_hash
                })

        # 有新链接时保存到文件
        if missing_links:
            save_links()

        print(f"[sync] 收到 {len(received_links)} 个链接，新增 {len(missing_links)} 个")
        return jsonify({'links': missing_links})

    except Exception as e:
        print(f"[error] {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/status', methods=['GET'])
def handle_status():
    """处理状态请求"""
    return jsonify({
        'links_count': len(links_db),
        'links': list(links_db.values())
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


def run_server(port=8080):
    """启动服务器"""
    load_links()
    print(f"Simple Sync Server (Flask) started at http://localhost:{port}")
    print(f"  数据文件: {DATA_FILE}")
    print(f"  Sync endpoint: POST http://localhost:{port}/api/sync")
    print(f"  Status page:   GET http://localhost:{port}/status")
    app.run(host='0.0.0.0', port=port, threaded=True)


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)
```

- [ ] **Step 2: 提交更改**

```bash
git add simple-sync/server.py simple-sync/requirements.txt
git commit -m "feat: 添加 Flask 版同步服务器"
```

---

### Task 3: 更新启动说明（如需要）

**Files:**
- Modify: `README.md` 或其他文档（如果存在）

- [ ] **Step 1: 添加 Flask 版本使用说明（如果需要）**

如果项目有 README，更新启动命令：
- 旧版：`python simple-server.py`
- 新版：`pip install -r requirements.txt && python server.py`
