"""同步注册中心"""
from typing import Dict
from interfaces import ISyncProvider


class SyncRegistry:
    """
    注册中心
    存储映射关系： "ORDER" -> OrderProvider
    """
    
    def __init__(self):
        self._providers: Dict[str, ISyncProvider] = {}
    
    def register(self, entity_type: str, provider: ISyncProvider) -> None:
        """注册业务提供者"""
        if entity_type in self._providers:
            raise ValueError(f"类型已存在: {entity_type}")
        
        self._providers[entity_type] = provider
        print(f"[OK] Register syncer: {entity_type}")
    
    def get_provider(self, entity_type: str) -> ISyncProvider:
        """获取提供者"""
        if entity_type not in self._providers:
            raise ValueError(f"未找到提供者: {entity_type}")
        return self._providers[entity_type]
