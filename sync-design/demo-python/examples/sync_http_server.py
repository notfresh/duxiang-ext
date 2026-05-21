"""Sync HTTP Server - 将 SyncEngine 暴露为 HTTP 服务"""
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from core import SyncEngine, SyncLogDTO
from examples import Bookmark


class SyncRequestHandler(BaseHTTPRequestHandler):
    """HTTP 请求处理器，路由到 SyncEngine"""

    engine: SyncEngine = None  # 由外部注入

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/sync/pull":
            params = parse_qs(parsed.query)
            try:
                entity_type = params["entityType"][0]
                last_cursor = int(params["lastCursor"][0])

                response = self.engine.on_pull_request(entity_type, last_cursor)
                self._json_response(200, {"success": True, "data": response.to_dict()})
            except Exception as e:
                self._json_response(500, {"success": False, "error": str(e)})
        else:
            self._json_response(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/sync/push":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(content_length))

                entity_type = body["entityType"]
                items_data = body["items"]

                # 反序列化 items
                items = [SyncLogDTO.from_dict(item, Bookmark) for item in items_data]

                response = self.engine.on_push_request(entity_type, items)
                self._json_response(200, response.to_dict())
            except Exception as e:
                self._json_response(500, {"success": False, "error": str(e)})
        else:
            self._json_response(404, {"error": "Not found"})

    def _json_response(self, status_code: int, data: dict):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        # 静默请求日志
        pass


def start_http_server(host: str, port: int, engine: SyncEngine) -> HTTPServer:
    """启动 HTTP 同步服务器"""
    SyncRequestHandler.engine = engine
    server = HTTPServer((host, port), SyncRequestHandler)
    print(f" Sync Server started on {host}:{port}")
    return server
