"""Bookmark 实体和日志的实现"""
import hashlib
import time
import uuid
from typing import Optional
from interfaces import ISyncEntity, ISyncLog, IBatchLog, Operation
from interfaces.entity import ConflictState, IConflictData


class ConflictDataImpl(IConflictData):
    """冲突数据实现"""

    def __init__(self, local_version: dict, remote_version: dict, conflict_time: int):
        self._local = local_version
        self._remote = remote_version
        self._time = conflict_time

    def get_local_version(self) -> dict:
        return self._local

    def get_remote_version(self) -> dict:
        return self._remote

    def get_conflict_time(self) -> int:
        return self._time


def hash_url(url: str, length: int = 16) -> str:
    """对 URL 做 SHA256 哈希，取前 N 位作为实体 ID。

    为什么用 hash(url)：
    - 确定性：相同 URL 生成相同 ID，不依赖中心化服务
    - 一致性：多端独立生成相同 ID，天然同步
    - 简单：不需要查询或协调
    """
    return hashlib.sha256(url.encode('utf-8')).hexdigest()[:length]


class Bookmark(ISyncEntity):
    """书签实体

    唯一性 ID 策略：hash(url)，取 SHA256 前 16 位。
    这样不同节点对同一个 URL 生成的 ID 完全一致，天然同步。
    """

    def __init__(self, bookmark_id: Optional[str] = None, url: str = "",
                 title: str = "", updated_at: int = 0, seq: int = 0,
                 conflict_state: ConflictState = ConflictState.NONE,
                 conflict_data: Optional[dict] = None):
        # 如果没传 bookmark_id，用 hash(url) 生成
        self.bookmark_id = bookmark_id if bookmark_id else hash_url(url)
        self.url = url
        self.title = title
        self.updated_at = updated_at  # 实体级版本号（仅用于显示/排序，不参与同步）
        self.seq = seq               # 节点本地 seq
        self.conflict_state = conflict_state
        # 存储原始 dict，get_conflict_data() 时再包装
        self._conflict_data_raw = conflict_data

    def get_primary_key(self) -> str:
        return self.bookmark_id

    def get_seq(self) -> int:
        return self.seq

    def get_version(self) -> int:
        return self.updated_at

    def get_entity_type(self) -> str:
        return "BOOKMARK"

    def get_conflict_state(self) -> ConflictState:
        return self.conflict_state

    def get_conflict_data(self) -> Optional[IConflictData]:
        if self._conflict_data_raw is None:
            return None
        return ConflictDataImpl(
            local_version=self._conflict_data_raw.get('localVersion', {}),
            remote_version=self._conflict_data_raw.get('remoteVersion', {}),
            conflict_time=self._conflict_data_raw.get('conflictTime', 0)
        )

    def to_dict(self) -> dict:
        return {
            'bookmarkId': self.bookmark_id,
            'url': self.url,
            'title': self.title,
            'updatedAt': self.updated_at,
            'seq': self.seq,
            'conflictState': self.conflict_state.value,
            'conflictData': self._conflict_data_raw
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Bookmark':
        return cls(
            bookmark_id=data.get('bookmarkId'),
            url=data['url'],
            title=data['title'],
            updated_at=data.get('updatedAt', 0),
            seq=data.get('seq', 0),
            conflict_state=ConflictState(data.get('conflictState', 'NONE')),
            conflict_data=data.get('conflictData')
        )

    def __repr__(self):
        return f"Bookmark(id={self.bookmark_id}, title='{self.title}', seq={self.seq})"


class BookmarkSyncLog(ISyncLog):
    """书签同步日志 - 单条日志（CREATE/UPDATE/DELETE）"""

    def __init__(self, log_id: str, entity_id: str, operation: Operation,
                 seq: int, payload: Optional[Bookmark],
                 entities: Optional[list] = None):
        self.log_id = log_id
        self.entity_id = entity_id
        self.operation = operation
        self.seq = seq
        self.payload = payload
        # 仅 BATCH_CREATE 时使用
        self._entities = entities or []

    def get_log_id(self) -> str:
        return self.log_id

    def get_entity_id(self) -> str:
        return self.entity_id

    def get_operation(self) -> Operation:
        return self.operation

    def get_seq(self) -> int:
        return self.seq

    def get_payload(self) -> Optional[Bookmark]:
        return self.payload

    def to_dict(self) -> dict:
        result = {
            'logId': self.log_id,
            'entityId': self.entity_id,
            'operation': self.operation.value,
            'seq': self.seq,
            'payload': self.payload.to_dict() if self.payload else None
        }
        # BATCH_CREATE 才有 entities
        if self.operation == Operation.BATCH_CREATE and self._entities:
            result['entities'] = [e.to_dict() if hasattr(e, 'to_dict') else e
                                  for e in self._entities]
        return result

    @classmethod
    def from_dict(cls, data: dict, entity_class: type = Bookmark) -> 'BookmarkSyncLog':
        payload = None
        if data.get('payload'):
            payload = entity_class.from_dict(data['payload'])

        entities_data = data.get('entities', [])
        entities = [entity_class.from_dict(e) for e in entities_data]

        return cls(
            log_id=data['logId'],
            entity_id=data['entityId'],
            operation=Operation(data['operation']),
            seq=data['seq'],
            payload=payload,
            entities=entities
        )

    @staticmethod
    def create_log(entity_id: str, operation: Operation,
                   payload: Optional[Bookmark], seq: int) -> 'BookmarkSyncLog':
        """工厂方法：创建单条日志"""
        return BookmarkSyncLog(
            log_id=str(uuid.uuid4()),
            entity_id=entity_id,
            operation=operation,
            seq=seq,
            payload=payload
        )

    @staticmethod
    def create_batch_log(log_id: str, entities: list) -> 'BookmarkSyncLog':
        """工厂方法：创建批量日志（BATCH_CREATE）

        entities 是已经分配好 seq 的 Bookmark 列表
        seq 取列表中第一个实体的 seq
        """
        if not entities:
            raise ValueError("BatchLog requires at least one entity")
        first = entities[0]
        return BookmarkSyncLog(
            log_id=log_id,
            entity_id=first.get_primary_key(),
            operation=Operation.BATCH_CREATE,
            seq=first.seq,
            payload=first,
            entities=entities
        )
