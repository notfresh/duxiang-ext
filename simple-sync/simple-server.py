#!/usr/bin/env python3
"""
轻量级同步服务器
使用 Python 3 内置模块，无需外部依赖
"""

import json
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# 存储结构: {hash: {"title": ..., "url": ..., "hash": ...}}
links_db = {}


def compute_hash(title: str, url: str) -> str:
    """计算 SHA-256 hash，内容为 title + '::' + url"""
    content = f"{title}::{url}"
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


class SyncHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        """处理 POST 请求"""
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/api/sync':
            self.handle_sync()
        else:
            self.send_error(404, 'Not Found')

    def handle_sync(self):
        """处理同步请求"""
        try:
            # 读取请求体
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            # 尝试 utf-8，失败则用 gbk（Windows 控制台）
            try:
                body_str = body.decode('utf-8')
            except UnicodeDecodeError:
                body_str = body.decode('gbk', errors='ignore')
            data = json.loads(body_str)

            is_pull = data.get('pull', False)
            received_links = data.get('links', [])

            # 拉取模式：返回服务器上所有的链接
            if is_pull:
                all_links = list(links_db.values())
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {'links': all_links}
                self.wfile.write(json.dumps(response).encode('utf-8'))
                print(f"[pull] 返回 {len(all_links)} 个链接")
                return

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

            # 返回服务器没有的链接（对方没有的）
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'links': missing_links}
            self.wfile.write(json.dumps(response).encode('utf-8'))

            print(f"[sync] 收到 {len(received_links)} 个链接，新增 {len(missing_links)} 个")

        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self):
        """处理 GET 请求，用于查看状态"""
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'links_count': len(links_db), 'links': list(links_db.values())}
            self.wfile.write(json.dumps(response, ensure_ascii=False, indent=2).encode('utf-8'))
        elif parsed_path.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
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
            self.wfile.write(html.encode('utf-8'))
        else:
            self.send_error(404, 'Not Found')

    def log_message(self, format, *args):
        """自定义日志格式"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server(port=8080):
    """启动服务器"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, SyncHandler)
    print(f"Simple Sync Server started at http://localhost:{port}")
    print(f"  Sync endpoint: POST http://localhost:{port}/api/sync")
    print(f"  Status page:   GET http://localhost:{port}/status")
    print(f"Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        httpd.server_close()


if __name__ == '__main__':
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)
