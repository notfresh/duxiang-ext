"""SyncEngine - 编排层"""
from typing import List, Optional
from dataclasses import dataclass
from .registry import SyncRegistry
from .client import SyncClient
from .server import SyncServer
from .dto import SyncPullResponse, SyncPushResponse, SyncLogDTO


@dataclass
class SyncEngineOptions:
    """同步引擎配置选项"""
    client_enabled: bool = True   # 默认开启主动同步能力
    server_enabled: bool = False  # 默认关闭被动服务能力，按需开启


class SyncEngine:
    """
    编排层
    职责：将 Client 和 Server 组装起来，维护 knownPeers 列表，
    并通过 SyncEngineOptions 编排两种角色是否启用
    """
    
    def __init__(self, options: SyncEngineOptions, client: Optional[SyncClient] = None, 
                 server: Optional[SyncServer] = None):
        self.options = options
        self.client = client
        self.server = server
        self.known_peers: List[str] = []
    
    def is_client_enabled(self) -> bool:
        return self.options.client_enabled
    
    def is_server_enabled(self) -> bool:
        return self.options.server_enabled
    
    # ── Peer 列表维护（编排层负责）──────────────────────
    
    def register_peer(self, peer_id: str) -> None:
        """注册对等节点"""
        if peer_id not in self.known_peers:
            self.known_peers.append(peer_id)
            print(f"📋 注册 peer: {peer_id}")
    
    def unregister_peer(self, peer_id: str) -> None:
        """注销对等节点"""
        if peer_id in self.known_peers:
            self.known_peers.remove(peer_id)
    
    def get_known_peers(self) -> List[str]:
        """获取已知对等节点列表"""
        return self.known_peers.copy()
    
    # ── Server 侧入口（供网络路由层调用）──────────────────
    
    def on_pull_request(self, entity_type: str, cursor: int) -> SyncPullResponse:
        """处理 Pull 请求"""
        if not self.options.server_enabled:
            raise RuntimeError("Server feature is disabled")
        return self.server.handle_pull(entity_type, cursor)
    
    def on_push_request(self, entity_type: str, items: List[SyncLogDTO]) -> SyncPushResponse:
        """处理 Push 请求"""
        if not self.options.server_enabled:
            raise RuntimeError("Server feature is disabled")
        return self.server.handle_push(entity_type, items)
    
    # ── Client 侧入口（供业务层/定时器调用）───────────────
    
    def pull(self, peer_id: str, entity_type: str) -> None:
        """单独 pull：按需拉取某个 peer 的增量数据"""
        if not self.options.client_enabled:
            print("⚠️ Client feature is disabled")
            return
        self.client.pull(peer_id, entity_type)
    
    def push(self, peer_id: str, entity_type: str) -> None:
        """单独 push：按需将本地变更推送给某个 peer"""
        if not self.options.client_enabled:
            print("⚠️ Client feature is disabled")
            return
        self.client.push(peer_id, entity_type)
    
    def pull_all(self, entity_type: str) -> None:
        """按当前已知 peer 列表执行一轮 pull"""
        if not self.options.client_enabled:
            print("⚠️ Client feature is disabled")
            return
        for peer_id in self.known_peers:
            self.client.pull(peer_id, entity_type)
    
    def sync_with_peer(self, peer_id: str, entity_type: str) -> None:
        """组合同步：pull + push 的显式便捷包装"""
        if not self.options.client_enabled:
            print("⚠️ Client feature is disabled")
            return
        self.client.sync_with_peer(peer_id, entity_type)
