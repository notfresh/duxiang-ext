"""Bookmark Provider 实现"""
from typing import List, Optional
from interfaces import ISyncProvider, ISyncLog, Operation
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
        self.entity_class = Bookmark  # 保存实体类，供client使用
    
    # ========== 查询方法 ==========
    
    def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]:
        """获取增量日志"""
        logs_data = self.storage.load_list(self.log_file)
        logs = [BookmarkSyncLog.from_dict(log) for log in logs_data]
        
        # 过滤并排序
        filtered = [log for log in logs if log.get_timestamp() > last_cursor]
        filtered.sort(key=lambda x: x.get_timestamp())
        
        return filtered
    
    def get_entity_by_id(self, entity_id: str) -> Optional[Bookmark]:
        """查询本地实体"""
        entities = self.storage.load(self.entity_file)
        entity_data = entities.get(entity_id)
        
        if entity_data:
            return Bookmark.from_dict(entity_data)
        return None
    
    # ========== 接收端写操作 ==========
    
    def upsert(self, entity: Bookmark) -> None:
        """幂等写入"""
        entities = self.storage.load(self.entity_file)
        entities[entity.get_primary_key()] = entity.to_dict()
        self.storage.save(self.entity_file, entities)
    
    def delete(self, entity_id: str) -> None:
        """删除实体"""
        entities = self.storage.load(self.entity_file)
        if entity_id in entities:
            del entities[entity_id]
            self.storage.save(self.entity_file, entities)
    
    # ========== 写日志与原子写（方案 A） ==========
    
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
        # 简化实现：先删实体，再写日志（实际应在同一事务中）
        self.delete(entity_id)
        self.append_log(log)
    
    # ========== 业务层便捷方法 ==========
    
    def create_bookmark(self, bookmark: Bookmark) -> None:
        """业务方法：创建书签（带日志）"""
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark.get_primary_key(),
            operation=Operation.CREATE,
            payload=bookmark
        )
        self.upsert_with_log(bookmark, log)
        print(f"[CREATE] {bookmark}")
    
    def update_bookmark(self, bookmark: Bookmark) -> None:
        """业务方法：更新书签（带日志）"""
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark.get_primary_key(),
            operation=Operation.UPDATE,
            payload=bookmark
        )
        self.upsert_with_log(bookmark, log)
        print(f"[UPDATE] {bookmark}")
    
    def delete_bookmark(self, bookmark_id: str) -> None:
        """业务方法：删除书签（带日志）"""
        log = BookmarkSyncLog.create_log(
            entity_id=bookmark_id,
            operation=Operation.DELETE,
            payload=None
        )
        self.delete_with_log(bookmark_id, log)
        print(f":DELETE: {bookmark_id}")
    
    def list_all(self) -> List[Bookmark]:
        """列出所有书签"""
        entities = self.storage.load(self.entity_file)
        return [Bookmark.from_dict(data) for data in entities.values()]
