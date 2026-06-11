"""数据传输对象（DTO）定义"""
from typing import List, Optional
from dataclasses import dataclass
from interfaces import ISyncEntity, Operation


@dataclass
class SyncLogDTO:
    """
    单条传输日志（wire schema，不直接暴露本地 ISyncLog 接口）

    借鉴 TCP 序列号机制：使用 log_seq（节点本地 seq）作为游标推进依据，
    各节点独立维护，不需要时钟同步。
    """
    log_seq: int            # 节点本地 seq，游标推进依据
    entity_id: str
    operation: Operation    # CREATE | UPDATE | DELETE | BATCH_CREATE
    payload: Optional[ISyncEntity]  # DELETE 时为 None

    def to_dict(self) -> dict:
        return {
            'logSeq': self.log_seq,
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
            log_seq=data['logSeq'],
            entity_id=data['entityId'],
            operation=Operation(data['operation']),
            payload=payload
        )


@dataclass
class SyncPullResponse:
    """
    Pull 响应包：Server 返回给 Client 的增量数据

    包含 local_seq：Server 节点的当前 seq 上限，
    Client 收到后可以直接推进 pull_cursor 到此值。
    """
    items: List[SyncLogDTO]  # 增量数据列表（按 logSeq 升序）
    next_cursor: int         # 本批 DTO 中最大的 logSeq
    local_seq: int           # Server 节点的当前 local_seq

    def to_dict(self) -> dict:
        return {
            'items': [item.to_dict() for item in self.items],
            'nextCursor': self.next_cursor,
            'localSeq': self.local_seq
        }

    @classmethod
    def from_dict(cls, data: dict, entity_class: type) -> 'SyncPullResponse':
        items = [SyncLogDTO.from_dict(item, entity_class) for item in data.get('items', [])]
        return cls(
            items=items,
            next_cursor=data.get('nextCursor', 0),
            local_seq=data.get('localSeq', 0)
        )


@dataclass
class SyncPushResponse:
    """
    Push 响应体：Server 返回给 Client 的处理结果

    server_ack_seq: Server 节点本次处理成功的最大 logSeq，
    Client 收到 success=true 后推进 push_cursor 到此值。
    """
    success: bool
    server_ack_seq: int      # 本次成功处理的最大 logSeq
    acked_entity_ids: List[str]  # 已成功处理的 entityId 列表（诊断用途）

    def to_dict(self) -> dict:
        return {
            'success': self.success,
            'serverAckSeq': self.server_ack_seq,
            'ackedEntityIds': self.acked_entity_ids
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'SyncPushResponse':
        return cls(
            success=data.get('success', False),
            server_ack_seq=data.get('serverAckSeq', 0),
            acked_entity_ids=data.get('ackedEntityIds', [])
        )
