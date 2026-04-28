"""数据传输对象（DTO）定义"""
from typing import List, Optional
from dataclasses import dataclass
from interfaces import ISyncEntity, Operation


@dataclass
class SyncLogDTO:
    """
    单条传输日志（wire schema，不直接暴露本地 ISyncLog 接口）
    """
    log_timestamp: int      # 是游标推进的唯一依据
    entity_id: str
    operation: Operation    # CREATE | UPDATE | DELETE
    payload: Optional[ISyncEntity]  # DELETE 时为 None
    
    def to_dict(self) -> dict:
        return {
            'logTimestamp': self.log_timestamp,
            'entityId': self.entity_id,
            'operation': self.operation.value,
            'payload': self.payload.to_dict() if self.payload else None
        }
    
    @classmethod
    def from_dict(cls, data: dict, entity_class: type) -> 'SyncLogDTO':
        payload = None
        if data.get('payload'):
            payload = entity_class.from_dict(data['payload'])
        
        return cls(
            log_timestamp=data['logTimestamp'],
            entity_id=data['entityId'],
            operation=Operation(data['operation']),
            payload=payload
        )


@dataclass
class SyncPullResponse:
    """
    Pull 响应包：Server 返回给 Client 的增量数据
    """
    items: List[SyncLogDTO]  # 增量数据列表（按 logTimestamp 升序）
    next_cursor: int         # 本批 DTO 中最大的 logTimestamp
    
    def to_dict(self) -> dict:
        return {
            'items': [item.to_dict() for item in self.items],
            'nextCursor': self.next_cursor
        }
    
    @classmethod
    def from_dict(cls, data: dict, entity_class: type) -> 'SyncPullResponse':
        items = [SyncLogDTO.from_dict(item, entity_class) for item in data.get('items', [])]
        return cls(
            items=items,
            next_cursor=data.get('nextCursor', 0)
        )


@dataclass
class SyncPushResponse:
    """
    Push 响应体：Server 返回给 Client 的处理结果
    """
    success: bool
    server_ack_timestamp: int  # 本次成功处理的最大 logTimestamp
    acked_entity_ids: List[str]  # 已成功处理的 entityId 列表（诊断用途）
    
    def to_dict(self) -> dict:
        return {
            'success': self.success,
            'serverAckTimestamp': self.server_ack_timestamp,
            'ackedEntityIds': self.acked_entity_ids
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'SyncPushResponse':
        return cls(
            success=data.get('success', False),
            server_ack_timestamp=data.get('serverAckTimestamp', 0),
            acked_entity_ids=data.get('ackedEntityIds', [])
        )
