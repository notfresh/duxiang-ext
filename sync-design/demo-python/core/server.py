"""SyncServer - 被动响应对端请求"""
from typing import List
from .registry import SyncRegistry
from .dto import SyncLogDTO, SyncPullResponse, SyncPushResponse


class SyncServer:
    """
    Server 侧逻辑
    职责：被动响应对端请求，完全无状态（Stateless）
    给定输入，返回输出，不记录任何同步进度
    """
    
    def __init__(self, registry: SyncRegistry):
        self.registry = registry
    
    def handle_pull(self, entity_type: str, last_cursor: int) -> SyncPullResponse:
        """
        handlePull(entityType, lastCursor)
        对端来拉数据：查本地日志，组装传输 DTO 返回
        """
        provider = self.registry.get_provider(entity_type)
        
        # 1. 查本地在 lastCursor 之后的变更日志（按 log_timestamp 升序）
        logs = provider.get_changed_logs(last_cursor)
        
        # 2. 直接从本地日志组装传输 DTO
        items: List[SyncLogDTO] = []
        for log in logs:
            item = SyncLogDTO(
                log_timestamp=log.get_timestamp(),
                entity_id=log.get_entity_id(),
                operation=log.get_operation(),
                payload=log.get_payload()  # DELETE 时为 None
            )
            items.append(item)
        
        # 3. 设置游标（取本批 DTO 中最大的 logTimestamp）
        next_cursor = last_cursor
        if items:
            next_cursor = max(item.log_timestamp for item in items)
        
        return SyncPullResponse(items=items, next_cursor=next_cursor)
    
    def handle_push(self, entity_type: str, items: List[SyncLogDTO]) -> SyncPushResponse:
        """
        handlePush(entityType, items)
        对端把数据推过来：接收并写入本地，返回 ack
        """
        provider = self.registry.get_provider(entity_type)
        max_timestamp = 0
        acked_ids: List[str] = []
        
        for item in items:
            try:
                if item.operation.value == 'DELETE':
                    provider.delete(item.entity_id)
                else:
                    # 冲突解决：LWW，与 SyncClient.pull 中逻辑完全对称
                    local = provider.get_entity_by_id(item.entity_id)
                    if local is None or local.get_version() < item.payload.get_version():
                        provider.upsert(item.payload)
                
                acked_ids.append(item.entity_id)
                if item.log_timestamp > max_timestamp:
                    max_timestamp = item.log_timestamp
                    
            except Exception as error:
                print(f"ERR Failed to apply item: {item.entity_id}, error: {error}")
                # 失败立即返回；Client 不推进游标，下次从同一 cursor 重试整批数据
                return SyncPushResponse(
                    success=False,
                    server_ack_timestamp=max_timestamp,
                    acked_entity_ids=acked_ids
                )
        
        return SyncPushResponse(
            success=True,
            server_ack_timestamp=max_timestamp,
            acked_entity_ids=acked_ids
        )
