"""SyncClient - 主动发起 pull 和 push"""
from typing import List
from interfaces import ISyncCursorManager, INetworkTransport
from .registry import SyncRegistry
from .dto import SyncLogDTO, SyncPullResponse


class SyncClient:
    """
    Client 侧逻辑
    职责：主动发起 pull 和 push，管理游标，是唯一持有同步状态的一方
    """
    
    def __init__(self, registry: SyncRegistry, cursor_manager: ISyncCursorManager, 
                 transport: INetworkTransport):
        self.registry = registry
        self.cursor_manager = cursor_manager
        self.transport = transport
    
    def pull(self, peer_id: str, entity_type: str) -> None:
        """
        pull(peerId, entityType)
        语义：我主动去拉取 peerId 上比我更新的数据
        触发时机：启动时、定时兜底、收到对端"有新数据"通知时
        """
        provider = self.registry.get_provider(entity_type)
        
        # 1. 读游标：我上次从这个 peer 成功拉到的时间点
        cursor = self.cursor_manager.get_pull_cursor(peer_id, entity_type)
        
        # 2. 向对端 Server 请求增量数据
        response = self.transport.get(peer_id, "/sync/pull", {
            'entityType': entity_type,
            'lastCursor': cursor
        })
        
        if not response.success:
            print(f"❌ pull failed from {peer_id}: {response.error}")
            return  # 不更新游标，下次从同一游标重试
        
        # 获取实体类，用于反序列化
        entity_class = self._get_entity_class(entity_type)
        package = SyncPullResponse.from_dict(response.data, entity_class)
        
        # 3. 按 logTimestamp 升序应用数据（幂等）
        for item in package.items:
            if item.operation.value == 'DELETE':
                provider.delete(item.entity_id)
            else:
                # 冲突解决：LWW（Last-Write-Wins by entity.get_version()）
                local = provider.get_entity_by_id(item.entity_id)
                if local is None or local.get_version() < item.payload.get_version():
                    provider.upsert(item.payload)
                # else: 本地版本更新，丢弃对端旧数据
        
        # 4. 数据写入本地成功后，才推进游标
        if package.next_cursor > cursor:
            self.cursor_manager.save_pull_cursor(peer_id, entity_type, package.next_cursor)
            print(f"✅ pull from {peer_id}: {len(package.items)} items, cursor -> {package.next_cursor}")
    
    def push(self, peer_id: str, entity_type: str) -> None:
        """
        push(peerId, entityType)
        语义：我把本地新变更主动推给 peerId
        触发时机：本地数据发生变更时（实时）、重试队列消费时
        """
        provider = self.registry.get_provider(entity_type)
        
        # 1. 读游标：我上次成功推给这个 peer 的时间点
        cursor = self.cursor_manager.get_push_cursor(peer_id, entity_type)
        
        # 2. 查本地在游标之后产生的变更日志
        logs = provider.get_changed_logs(cursor)
        
        if not logs:
            return  # 没有新变更，不发请求
        
        # 3. 组装 SyncLogDTO：从本地 ISyncLog 提取网络层所需字段
        items = []
        for log in logs:
            item = SyncLogDTO(
                log_timestamp=log.get_timestamp(),
                entity_id=log.get_entity_id(),
                operation=log.get_operation(),
                payload=log.get_payload()
            )
            items.append(item)
        
        # 4. 推送给对端
        response = self.transport.post(peer_id, "/sync/push", {
            'entityType': entity_type,
            'items': [item.to_dict() for item in items]
        })
        
        # 5. 只有对端 success=true 时，才按 serverAckTimestamp 推进游标
        if response.success and response.data.get('success'):
            ack_timestamp = response.data.get('serverAckTimestamp', 0)
            self.cursor_manager.save_push_cursor(peer_id, entity_type, ack_timestamp)
            print(f"✅ push to {peer_id}: {len(items)} items, cursor -> {ack_timestamp}")
        else:
            print(f"❌ push failed to {peer_id}, will retry from cursor: {cursor}")
    
    def sync_with_peer(self, peer_id: str, entity_type: str) -> None:
        """
        syncWithPeer(peerId, entityType)
        【显式组合方法】= pull + push 的便捷包装
        默认顺序：先 pull（获取对端最新状态）再 push（推送本地变更）
        """
        self.pull(peer_id, entity_type)
        self.push(peer_id, entity_type)
    
    def _get_entity_class(self, entity_type: str):
        """根据实体类型获取对应的类（简化版，实际可以通过注册表获取）"""
        # 这里需要provider提供实体类信息，简化处理
        provider = self.registry.get_provider(entity_type)
        # 假设provider有entity_class属性
        return getattr(provider, 'entity_class', None)
