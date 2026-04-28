#!/usr/bin/env python3
"""
UniversalSyncEngine Demo
演示 P2P 同步引擎的基本功能
"""
import time
from storage import JsonStorage, JsonCursorManager
from core import SyncRegistry, SyncClient, SyncServer, SyncEngine, SyncEngineOptions
from examples import Bookmark, BookmarkProvider, MockTransport


def print_section(title: str):
    """打印分隔线"""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print('=' * 60)


def create_node(node_id: str, transport: MockTransport, 
                client_enabled: bool = True, server_enabled: bool = True) -> tuple:
    """创建一个同步节点"""
    # 1. 创建存储和游标管理器
    storage = JsonStorage(f"./data/{node_id}")
    cursor_manager = JsonCursorManager(storage, node_id)
    
    # 2. 创建注册中心并注册 Provider
    registry = SyncRegistry()
    provider = BookmarkProvider(storage, node_id)
    registry.register("BOOKMARK", provider)
    
    # 3. 创建 Client 和 Server
    client = SyncClient(registry, cursor_manager, transport) if client_enabled else None
    server = SyncServer(registry) if server_enabled else None
    
    # 4. 创建引擎
    options = SyncEngineOptions(
        client_enabled=client_enabled,
        server_enabled=server_enabled
    )
    engine = SyncEngine(options, client, server)
    
    return engine, provider


def demo_basic_sync():
    """演示基本的 P2P 同步"""
    print_section("演示 1: 基本的双向同步")
    
    # 创建 Mock 传输层（模拟网络）
    transport = MockTransport()
    
    # 创建两个节点
    print("\n🔧 创建节点 A 和节点 B...")
    engine_a, provider_a = create_node("node-a", transport)
    engine_b, provider_b = create_node("node-b", transport)
    
    # 注册到传输层
    transport.register_engine("node-a", engine_a)
    transport.register_engine("node-b", engine_b)
    
    # 节点互相注册为 peer
    engine_a.register_peer("node-b")
    engine_b.register_peer("node-a")
    
    # 节点 A 创建一些书签
    print("\n📚 节点 A 创建书签...")
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-1",
        url="https://github.com",
        title="GitHub",
        updated_at=int(time.time() * 1000)
    ))
    time.sleep(0.01)  # 确保时间戳不同
    
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-2",
        url="https://python.org",
        title="Python",
        updated_at=int(time.time() * 1000)
    ))
    
    print(f"  节点 A 书签数: {len(provider_a.list_all())}")
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    
    # 节点 B 从节点 A 拉取数据
    print("\n🔄 节点 B pull 节点 A 的数据...")
    engine_b.pull("node-a", "BOOKMARK")
    
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    for bm in provider_b.list_all():
        print(f"    - {bm}")
    
    # 节点 B 创建新书签
    print("\n📚 节点 B 创建书签...")
    provider_b.create_bookmark(Bookmark(
        bookmark_id="bk-3",
        url="https://stackoverflow.com",
        title="Stack Overflow",
        updated_at=int(time.time() * 1000)
    ))
    
    # 节点 A 从节点 B 拉取
    print("\n🔄 节点 A pull 节点 B 的数据...")
    engine_a.pull("node-b", "BOOKMARK")
    
    print(f"  节点 A 书签数: {len(provider_a.list_all())}")
    for bm in provider_a.list_all():
        print(f"    - {bm}")


def demo_conflict_resolution():
    """演示冲突解决（LWW）"""
    print_section("演示 2: 冲突解决（Last-Write-Wins）")
    
    transport = MockTransport()
    
    print("\n🔧 创建节点 A 和节点 B...")
    engine_a, provider_a = create_node("node-a", transport)
    engine_b, provider_b = create_node("node-b", transport)
    
    transport.register_engine("node-a", engine_a)
    transport.register_engine("node-b", engine_b)
    
    engine_a.register_peer("node-b")
    engine_b.register_peer("node-a")
    
    # 两个节点都创建相同 ID 的书签
    print("\n📚 节点 A 和节点 B 创建相同 ID 的书签...")
    
    timestamp_a = int(time.time() * 1000)
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-conflict",
        url="https://a.com",
        title="Version A",
        updated_at=timestamp_a
    ))
    
    time.sleep(0.1)  # 确保 B 的时间戳更晚
    timestamp_b = int(time.time() * 1000)
    provider_b.create_bookmark(Bookmark(
        bookmark_id="bk-conflict",
        url="https://b.com",
        title="Version B (newer)",
        updated_at=timestamp_b
    ))
    
    print(f"  节点 A: {provider_a.get_entity_by_id('bk-conflict')}")
    print(f"  节点 B: {provider_b.get_entity_by_id('bk-conflict')}")
    
    # 节点 A pull 节点 B（B 的版本更新，应该覆盖 A）
    print("\n🔄 节点 A pull 节点 B（LWW 生效）...")
    engine_a.pull("node-b", "BOOKMARK")
    
    result = provider_a.get_entity_by_id("bk-conflict")
    print(f"  节点 A 最终版本: {result}")
    print(f"  ✅ 冲突解决: 保留了更新的版本（Version B）")


def demo_delete_sync():
    """演示删除操作同步"""
    print_section("演示 3: 删除操作同步")
    
    transport = MockTransport()
    
    print("\n🔧 创建节点 A 和节点 B...")
    engine_a, provider_a = create_node("node-a", transport)
    engine_b, provider_b = create_node("node-b", transport)
    
    transport.register_engine("node-a", engine_a)
    transport.register_engine("node-b", engine_b)
    
    engine_a.register_peer("node-b")
    engine_b.register_peer("node-a")
    
    # 节点 A 创建书签
    print("\n📚 节点 A 创建书签...")
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-delete",
        url="https://example.com",
        title="To Be Deleted",
        updated_at=int(time.time() * 1000)
    ))
    
    # 同步到节点 B
    print("\n🔄 同步到节点 B...")
    engine_b.pull("node-a", "BOOKMARK")
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    
    # 节点 A 删除书签
    print("\n🗑️ 节点 A 删除书签...")
    provider_a.delete_bookmark("bk-delete")
    print(f"  节点 A 书签数: {len(provider_a.list_all())}")
    
    # 节点 B 再次同步
    print("\n🔄 节点 B 再次 pull...")
    engine_b.pull("node-a", "BOOKMARK")
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    print(f"  ✅ 删除操作已同步")


def demo_push_operation():
    """演示 push 操作"""
    print_section("演示 4: Push 操作")
    
    transport = MockTransport()
    
    print("\n🔧 创建节点 A 和节点 B...")
    engine_a, provider_a = create_node("node-a", transport)
    engine_b, provider_b = create_node("node-b", transport)
    
    transport.register_engine("node-a", engine_a)
    transport.register_engine("node-b", engine_b)
    
    engine_a.register_peer("node-b")
    engine_b.register_peer("node-a")
    
    # 节点 A 创建书签
    print("\n📚 节点 A 创建书签...")
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-push",
        url="https://push-demo.com",
        title="Push Demo",
        updated_at=int(time.time() * 1000)
    ))
    
    print(f"  节点 A 书签数: {len(provider_a.list_all())}")
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    
    # 节点 A 主动 push 到节点 B
    print("\n📤 节点 A push 到节点 B...")
    engine_a.push("node-b", "BOOKMARK")
    
    print(f"  节点 B 书签数: {len(provider_b.list_all())}")
    for bm in provider_b.list_all():
        print(f"    - {bm}")


def demo_sync_with_peer():
    """演示 syncWithPeer（pull + push 组合）"""
    print_section("演示 5: syncWithPeer (Pull + Push 组合)")
    
    transport = MockTransport()
    
    print("\n🔧 创建节点 A 和节点 B...")
    engine_a, provider_a = create_node("node-a", transport)
    engine_b, provider_b = create_node("node-b", transport)
    
    transport.register_engine("node-a", engine_a)
    transport.register_engine("node-b", engine_b)
    
    engine_a.register_peer("node-b")
    engine_b.register_peer("node-a")
    
    # 节点 A 创建书签
    print("\n📚 节点 A 创建书签...")
    provider_a.create_bookmark(Bookmark(
        bookmark_id="bk-a1",
        url="https://a1.com",
        title="From A",
        updated_at=int(time.time() * 1000)
    ))
    
    # 节点 B 创建书签
    print("\n📚 节点 B 创建书签...")
    provider_b.create_bookmark(Bookmark(
        bookmark_id="bk-b1",
        url="https://b1.com",
        title="From B",
        updated_at=int(time.time() * 1000)
    ))
    
    print(f"\n  同步前:")
    print(f"    节点 A 书签数: {len(provider_a.list_all())}")
    print(f"    节点 B 书签数: {len(provider_b.list_all())}")
    
    # 节点 A 执行完整同步
    print("\n🔄 节点 A syncWithPeer 节点 B (pull + push)...")
    engine_a.sync_with_peer("node-b", "BOOKMARK")
    
    print(f"\n  同步后:")
    print(f"    节点 A 书签数: {len(provider_a.list_all())}")
    print(f"    节点 B 书签数: {len(provider_b.list_all())}")
    
    print("\n  节点 A 的书签:")
    for bm in provider_a.list_all():
        print(f"    - {bm}")
    
    print("\n  节点 B 的书签:")
    for bm in provider_b.list_all():
        print(f"    - {bm}")


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("  UniversalSyncEngine - Python Demo")
    print("  基于时间的 P2P 增量同步引擎")
    print("=" * 60)
    
    try:
        # 运行所有演示
        demo_basic_sync()
        demo_conflict_resolution()
        demo_delete_sync()
        demo_push_operation()
        demo_sync_with_peer()
        
        print_section("✅ 所有演示完成")
        print("\n💡 提示: 查看 ./data/ 目录可以看到生成的 JSON 文件")
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
