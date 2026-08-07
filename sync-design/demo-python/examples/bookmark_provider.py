"""Bookmark Provider 实现

借鉴 TCP 序列号机制：
- 维护 local_seq（持久化到 meta 文件）
- 每次业务修改（create/update/delete）分配一个新 seq
- 首次同步（无日志）时自动生成 BatchLog
- Upsert 时检测冲突，标记 CONFLICT_PENDING
"""
import time
import uuid
from typing import List, Optional
from interfaces import ISyncProvider, ISyncLog, Operation
from interfaces.entity import ConflictState
from storage import JsonStorage
from .bookmark import Bookmark, BookmarkSyncLog


class BookmarkProvider(ISyncProvider[Bookmark]):
    """
    书签数据提供者
    使用 JSON 存储实体和日志
    """

    def __init__(self, storage: JsonStorage, node_id: str):
        self.storage = storage
        self.node_id = node_id
        self.entity_file = f"bookmarks_{node_id}"
        self.log_file = f"sync_log_{node_id}"
        self.meta_file = f"meta_{node_id}"  # 存储 local_seq
        self.entity_class = Bookmark
        # 加载本地序列号
        self._local_seq = self._load_local_seq()

    # ========== 序列号管理 ==========

    def _load_local_seq(self) -> int:
        """加载本地序列号"""
        meta = self.storage.load(self.meta_file)
        if meta and isinstance(meta, dict):
            return int(meta.get('local_seq', 0))
        return 0

    def _save_local_seq(self) -> None:
        """保存本地序列号"""
        meta = self.storage.load(self.meta_file) or {}
        if not isinstance(meta, dict):
            meta = {}
        meta['local_seq'] = self._local_seq
        self.storage.save(self.meta_file, meta)

    def _next_seq(self) -> int:
        """分配并返回下一个本地序列号"""
        seq = self._local_seq
        self._local_seq += 1
        self._save_local_seq()
        return seq

    def get_local_seq(self) -> int:
        """暴露给 Server / Client 读取当前 local_seq"""
        return self._local_seq

    # ========== 查询方法 ==========

    def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]:
        """获取增量日志

        借鉴 TCP 序列号机制：cursor 是节点本地 seq。
        - 如果没有日志（首次同步）：扫描实体表，自动生成 BatchLog
        - 如果有日志：返回 seq > last_cursor 的增量
        """
        logs_data = self.storage.load_list(self.log_file)

        # 无日志 = 首次同步，扫描实体表生成 BatchLog
        if not logs_data:
            return self._create_initial_batch_log()

        logs = [BookmarkSyncLog.from_dict(log) for log in logs_data]
        # 过滤 seq > last_cursor
        filtered = [log for log in logs if log.get_seq() > last_cursor]
        filtered.sort(key=lambda x: x.get_seq())
        return filtered

    def _create_initial_batch_log(self) -> List[ISyncLog]:
        """首次同步：扫描实体表，分配 seq，生成 BatchLog

        调用时机：当 sync_log 为空时（即从未同步过），第一次 get_changed_logs
        行为：
          1. 扫描实体表（bookmarks）
          2. 为每个实体分配一个本地 seq
          3. 生成一条 BATCH_CREATE 日志
          4. 保存到 sync_log
          5. 返回这条 BatchLog
        """
        entities_data = self.storage.load(self.entity_file)
        if not entities_data:
            return []

        # 为每个实体分配 seq
        batch_entities: List[Bookmark] = []
        for entity_data in entities_data.values():
            bookmark = Bookmark.from_dict(entity_data)
            # 如果实体还没有 seq（首次初始化），分配一个新的
            if bookmark.seq == 0:
                bookmark.seq = self._next_seq()
            batch_entities.append(bookmark)

        if not batch_entities:
            return []

        # 创建 BatchLog
        batch_log = BookmarkSyncLog.create_batch_log(
            log_id=str(uuid.uuid4()),
            entities=batch_entities
        )

        # 保存日志和实体（更新实体的 seq）
        logs_data = self.storage.load_list(self.log_file)
        logs_data.append(batch_log.to_dict())
        self.storage.save_list(self.log_file, logs_data)

        updated_entities = {e.get_primary_key(): e.to_dict() for e in batch_entities}
        self.storage.save(self.entity_file, updated_entities)

        return [batch_log]

    def get_entity_by_id(self, entity_id: str) -> Optional[Bookmark]:
        """查询本地实体（仅用于冲突判断）"""
        entities = self.storage.load(self.entity_file)
        entity_data = entities.get(entity_id)
        if entity_data:
            return Bookmark.from_dict(entity_data)
        return None

    # ========== 接收端写操作 ==========

    def upsert(self, entity: Bookmark) -> None:
        """幂等写入 + 冲突检测

        冲突检测规则：
        - 本地没有该 entity：直接写入
        - 本地有但 seq 相同（幂等）：直接写入
        - 本地有、seq 不同、内容不同：标记为 CONFLICT_PENDING
        - 本地有、seq 不同、内容相同（罕见）：幂等
        """
        entities = self.storage.load(self.entity_file)
        existing_data = entities.get(entity.get_primary_key())

        if existing_data:
            existing = Bookmark.from_dict(existing_data)
            same_seq = existing.seq == entity.seq
            same_url = existing.url == entity.url

            if not same_seq and not same_url:
                # 冲突：标记为 CONFLICT_PENDING，记录双方数据
                entity.conflict_state = ConflictState.CONFLICT_PENDING
                entity._conflict_data_raw = {
                    'localVersion': existing.to_dict(),
                    'remoteVersion': entity.to_dict(),
                    'conflictTime': int(time.time() * 1000)
                }
                print(f"[CONFLICT] {entity.get_primary_key()}: "
                      f"local seq={existing.seq}, remote seq={entity.seq}")
            elif same_seq and same_url:
                # 幂等：seq 和内容都相同，无需冲突标记
                pass

        entities[entity.get_primary_key()] = entity.to_dict()
        self.storage.save(self.entity_file, entities)

    def delete(self, entity_id: str) -> None:
        """删除实体"""
        entities = self.storage.load(self.entity_file)
        if entity_id in entities:
            del entities[entity_id]
            self.storage.save(self.entity_file, entities)

    # ========== 写日志与原子写 ==========

    def append_log(self, log: ISyncLog) -> None:
        """仅写日志"""
        logs_data = self.storage.load_list(self.log_file)
        logs_data.append(log.to_dict())
        self.storage.save_list(self.log_file, logs_data)

    def upsert_with_log(self, entity: Bookmark, log: ISyncLog) -> None:
        """原子写入：实体 + 日志"""
        # 简化实现：先写实体，再写日志（实际应在同一事务中）
        self.upsert(entity)
        self.append_log(log)

    def delete_with_log(self, entity_id: str, log: ISyncLog) -> None:
        """原子删除：实体 + 日志"""
        self.delete(entity_id)
        self.append_log(log)

    # ========== 业务层便捷方法 ==========

    def create_bookmark(self, bookmark: Bookmark) -> None:
        """业务方法：创建书签（带日志，分配新 seq）"""
        # 分配新 seq
        bookmark.seq = self._next_seq()
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark.get_primary_key(),
            operation=Operation.CREATE,
            payload=bookmark,
            seq=bookmark.seq
        )
        self.upsert_with_log(bookmark, log)
        print(f"[CREATE] seq={bookmark.seq} {bookmark}")

    def update_bookmark(self, bookmark: Bookmark) -> None:
        """业务方法：更新书签（带日志，分配新 seq）"""
        bookmark.seq = self._next_seq()
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark.get_primary_key(),
            operation=Operation.UPDATE,
            payload=bookmark,
            seq=bookmark.seq
        )
        self.upsert_with_log(bookmark, log)
        print(f"[UPDATE] seq={bookmark.seq} {bookmark}")

    def delete_bookmark(self, bookmark_id: str) -> None:
        """业务方法：删除书签（带日志，分配新 seq）"""
        seq = self._next_seq()
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark_id,
            operation=Operation.DELETE,
            payload=None,
            seq=seq
        )
        self.delete_with_log(bookmark_id, log)
        print(f"[DELETE] seq={seq} {bookmark_id}")

    def list_all(self) -> List[Bookmark]:
        """列出所有书签"""
        entities = self.storage.load(self.entity_file)
        return [Bookmark.from_dict(data) for data in entities.values()]

    def list_conflicts(self) -> List[Bookmark]:
        """列出所有冲突实体（CONFLICT_PENDING 状态）"""
        return [b for b in self.list_all()
                if b.get_conflict_state() == ConflictState.CONFLICT_PENDING]
