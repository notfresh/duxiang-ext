#!/usr/bin/env python3
"""
UniversalSyncEngine - 交互式节点启动器

用法:
  python demo.py --node node-a --port 8001 --peer node-b http://localhost:8002
  python demo.py --node node-b --port 8002 --peer node-a http://localhost:8001

每个实例启动后进入交互式命令行，可执行:
  list / create <id> <url> <title> / delete <id>
  pull <peer> / push <peer> / sync <peer> / quit
"""
import argparse
import sys
import threading
import time
from storage import JsonStorage, JsonCursorManager
from core import SyncRegistry, SyncClient, SyncServer, SyncEngine, SyncEngineOptions
from examples import Bookmark, BookmarkProvider, HttpTransport, start_http_server


def create_node(node_id: str, transport: HttpTransport, data_dir: str,
                client_enabled: bool = True, server_enabled: bool = True) -> tuple:
    """创建一个同步节点"""
    storage = JsonStorage(f"{data_dir}/{node_id}")
    cursor_manager = JsonCursorManager(storage, node_id)

    registry = SyncRegistry()
    provider = BookmarkProvider(storage, node_id)
    registry.register("BOOKMARK", provider)

    client = SyncClient(registry, cursor_manager, transport) if client_enabled else None
    server = SyncServer(registry) if server_enabled else None

    options = SyncEngineOptions(
        client_enabled=client_enabled,
        server_enabled=server_enabled
    )
    engine = SyncEngine(options, client, server)

    return engine, provider


def print_help():
    print("\n  命令:")
    print("    list                          - 列出所有书签")
    print("    create <id> <url> <title>     - 创建书签")
    print("    delete <id>                   - 删除书签")
    print("    pull <peer>                   - 从 peer 拉取")
    print("    push <peer>                   - 推送到 peer")
    print("    sync <peer>                   - 完整同步 (pull+push)")
    print("    status                        - 查看节点状态")
    print("    quit                          - 退出")


def interactive_loop(engine, provider, transport, node_id):
    """交互式命令行"""
    print(f"\nNode [{node_id}] 已启动，输入 'help' 查看命令")
    print_help()

    while True:
        try:
            cmd = input(f"\n[{node_id}]> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n[QUIT]")
            break

        if not cmd:
            continue

        parts = cmd.split()
        action = parts[0].lower()

        if action == "quit" or action == "exit":
            print("[QUIT]")
            break

        elif action == "help":
            print_help()

        elif action == "list":
            items = provider.list_all()
            if items:
                print(f"  共 {len(items)} 条书签:")
                for bm in items:
                    print(f"    - {bm}")
            else:
                print("  (空)")

        elif action == "create" and len(parts) >= 4:
            bm_id = parts[1]
            url = parts[2]
            title = " ".join(parts[3:])
            provider.create_bookmark(Bookmark(
                bookmark_id=bm_id,
                url=url,
                title=title,
                updated_at=int(time.time() * 1000)
            ))

        elif action == "delete" and len(parts) >= 2:
            provider.delete_bookmark(parts[1])

        elif action == "pull" and len(parts) >= 2:
            engine.pull(parts[1], "BOOKMARK")

        elif action == "push" and len(parts) >= 2:
            engine.push(parts[1], "BOOKMARK")

        elif action == "sync" and len(parts) >= 2:
            engine.sync_with_peer(parts[1], "BOOKMARK")

        elif action == "status":
            print(f"  节点: {node_id}")
            print(f"  已知 peers: {engine.get_known_peers()}")
            print(f"  书签数: {len(provider.list_all())}")

        else:
            print(f"  [?] 未知命令: {cmd}，输入 'help' 查看帮助")


def main():
    parser = argparse.ArgumentParser(description="UniversalSyncEngine 交互式节点")
    parser.add_argument("--node", required=True, help="节点 ID")
    parser.add_argument("--port", type=int, default=8000, help="HTTP 服务端口")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP 服务地址")
    parser.add_argument("--peer", nargs=2, action="append",
                        metavar=("PEER_ID", "URL"),
                        help="注册 peer (可多次使用)")
    parser.add_argument("--data-dir", default="./nodes", help="数据目录")
    args = parser.parse_args()

    print(f"\n{'=' * 50}")
    print(f"  节点: {args.node}")
    print(f"  地址: {args.host}:{args.port}")
    print(f"  数据: {args.data_dir}/{args.node}")
    print(f"{'=' * 50}")

    # 创建传输层
    transport = HttpTransport()

    # 注册 peers
    if args.peer:
        for peer_id, peer_url in args.peer:
            transport.register_peer(peer_id, peer_url)

    # 创建节点
    engine, provider = create_node(
        node_id=args.node,
        transport=transport,
        data_dir=args.data_dir,
    )

    # 引擎侧也注册 peer
    if args.peer:
        for peer_id, _ in args.peer:
            engine.register_peer(peer_id)

    # 启动 HTTP 服务器（后台线程）
    server = start_http_server(args.host, args.port, engine)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # 进入交互式循环
    interactive_loop(engine, provider, transport, args.node)

    # 退出时关闭服务器
    server.shutdown()


if __name__ == "__main__":
    main()
