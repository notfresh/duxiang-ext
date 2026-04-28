"""Mock Transport - 模拟节点间通信"""
from typing import Dict, Any
from interfaces import INetworkTransport, NetworkResponse
from core import SyncEngine, SyncLogDTO


class MockTransport(INetworkTransport):
    """
    Mock 网络传输层
    在同一进程内模拟多节点通信
    """
    
    def __init__(self):
        self.engines: Dict[str, SyncEngine] = {}
    
    def register_engine(self, peer_id: str, engine: SyncEngine) -> None:
        """注册节点的引擎实例"""
        self.engines[peer_id] = engine
        print(f"🌐 注册节点引擎: {peer_id}")
    
    def get(self, peer_id: str, path: str, params: Dict[str, Any]) -> NetworkResponse:
        """模拟 GET 请求"""
        if peer_id not in self.engines:
            return NetworkResponse(success=False, error=f"Peer not found: {peer_id}")
        
        engine = self.engines[peer_id]
        
        if path == "/sync/pull":
            try:
                entity_type = params['entityType']
                last_cursor = params['lastCursor']
                
                response = engine.on_pull_request(entity_type, last_cursor)
                return NetworkResponse(success=True, data=response.to_dict())
            except Exception as e:
                return NetworkResponse(success=False, error=str(e))
        
        return NetworkResponse(success=False, error=f"Unknown path: {path}")
    
    def post(self, peer_id: str, path: str, body: Dict[str, Any]) -> NetworkResponse:
        """模拟 POST 请求"""
        if peer_id not in self.engines:
            return NetworkResponse(success=False, error=f"Peer not found: {peer_id}")
        
        engine = self.engines[peer_id]
        
        if path == "/sync/push":
            try:
                entity_type = body['entityType']
                items_data = body['items']
                
                # 反序列化 items（需要知道实体类型）
                from examples.bookmark import Bookmark
                items = [SyncLogDTO.from_dict(item, Bookmark) for item in items_data]
                
                response = engine.on_push_request(entity_type, items)
                return NetworkResponse(success=True, data=response.to_dict())
            except Exception as e:
                return NetworkResponse(success=False, error=str(e))
        
        return NetworkResponse(success=False, error=f"Unknown path: {path}")
