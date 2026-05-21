#!/usr/bin/env python3
"""自动测试两个节点通过 HTTP 同步"""
import sys
import time
import os
import threading
import json
import urllib.request

os.environ["PYTHONUTF8"] = "1"
sys.path.insert(0, os.path.dirname(__file__))

from storage import JsonStorage, JsonCursorManager
from core import SyncRegistry, SyncServer, SyncEngine, SyncEngineOptions
from examples import Bookmark, BookmarkProvider, HttpTransport


def clean():
    import shutil
    if os.path.exists("./nodes"):
        shutil.rmtree("./nodes")


def main():
    print("=" * 50)
    print("  测试: 两个独立节点 HTTP 同步")
    print("=" * 50)
    clean()

    # === Node A: Server only ===
    print("\n[1] 启动节点 A Server (端口 8001)...")
    engine_a, provider_a = create_node_a("./nodes/node-a", 8001)
    server_thread = threading.Thread(target=lambda: engine_a.serve_forever(), daemon=True)
    server_thread.start()
    time.sleep(0.5)

    # Create data on A
    ts = int(time.time() * 1000)
    provider_a.create_bookmark(Bookmark("bk-1", "https://github.com", "GitHub", ts))
    provider_a.create_bookmark(Bookmark("bk-2", "https://python.org", "Python", ts + 1))
    print(f"    节点 A 有 {len(provider_a.list_all())} 条书签")

    # === Node B: Client that pulls from A ===
    print("\n[2] 节点 B pull 节点 A...")
    storage_b = JsonStorage("./nodes/node-b")
    cursor_mgr_b = JsonCursorManager(storage_b, "node-b")

    transport_b = HttpTransport()
    transport_b.register_peer("node-a", "http://127.0.0.1:8001")

    registry_b = SyncRegistry()
    provider_b = BookmarkProvider(storage_b, "node-b")
    registry_b.register("BOOKMARK", provider_b)

    client_b = SyncClient(registry_b, cursor_mgr_b, transport_b)

    try:
        client_b.pull("node-a", "BOOKMARK")
    except Exception as e:
        print(f"    [ERR] Pull failed: {e}")
        import traceback; traceback.print_exc()
        return

    print(f"    节点 B 现在有 {len(provider_b.list_all())} 条书签")
    for bm in provider_b.list_all():
        print(f"      - {bm}")

    assert len(provider_b.list_all()) == 2, f"期望 2 条，实际 {len(provider_b.list_all())}"

    # === Step 3: B pushes new data back to A ===
    print("\n[3] 节点 B push 回节点 A...")
    provider_b.create_bookmark(Bookmark("bk-3", "https://example.com", "Example", ts + 10))

    from core.dto import SyncLogDTO
    logs = provider_b.get_changed_logs(cursor_mgr_b.get_push_cursor("node-a", "BOOKMARK"))
    items = [SyncLogDTO(log_timestamp=log.get_timestamp(), entity_id=log.get_entity_id(),
                        operation=log.get_operation(), payload=log.get_payload()) for log in logs]

    response = engine_a.on_push_request("BOOKMARK", items)
    print(f"    Push 响应: success={response.success}")

    assert response.success
    assert len(provider_a.list_all()) == 3
    print(f"    节点 A 现有 {len(provider_a.list_all())} 条书签")

    # === Verify ===
    ids_a = sorted(bm.bookmark_id for bm in provider_a.list_all())
    ids_b = sorted(bm.bookmark_id for bm in provider_b.list_all())
    print(f"\n[4] 一致性检查:")
    print(f"    A: {ids_a}")
    print(f"    B: {ids_b}")
    assert ids_a == ids_b

    print("\n" + "=" * 50)
    print("  测试通过!")
    print("=" * 50)
    print('\n用法:')
    print('  PYTHONUTF8=1 python demo.py --node node-a --port 8001 --peer node-b http://localhost:8002')
    print('  PYTHONUTF8=1 python demo.py --node node-b --port 8002 --peer node-a http://localhost:8001')


def create_node_a(data_dir, port):
    """创建节点A（仅Server），启动HTTP服务"""
    from examples.sync_http_server import start_http_server

    storage = JsonStorage(data_dir)
    cursor_manager = JsonCursorManager(storage, "node-a")

    registry = SyncRegistry()
    provider = BookmarkProvider(storage, "node-a")
    registry.register("BOOKMARK", provider)

    server = SyncServer(registry)
    options = SyncEngineOptions(client_enabled=False, server_enabled=True)
    engine = SyncEngine(options, client=None, server=server)

    # Start HTTP server
    sync_server = start_http_server("127.0.0.1", port, engine)

    # Add serve_forever method to engine for convenience
    engine._sync_server = sync_server

    def serve_forever():
        sync_server.serve_forever()

    engine.serve_forever = serve_forever

    return engine, provider


if __name__ == "__main__":
    from core.client import SyncClient
    main()
