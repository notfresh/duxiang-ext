"""数据提供者接口定义"""
from abc import ABC, abstractmethod
from typing import List, Optional, TypeVar, Generic
from .entity import ISyncEntity
from .log import ISyncLog


T = TypeVar('T', bound=ISyncEntity)


class ISyncProvider(ABC, Generic[T]):
    """数据提供者契约 - 业务方实现此接口，告诉框架如何存取数据"""
    
    @abstractmethod
    def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]:
        """
        [核心] 获取增量日志
        框架问：从 lastCursor 之后，有哪些数据变了？
        SQL: SELECT * FROM sync_log WHERE log_timestamp > cursor ORDER BY log_timestamp ASC
        """
        pass
    
    @abstractmethod
    def get_entity_by_id(self, entity_id: str) -> Optional[T]:
        """
        [接收侧] 查询本地实体，仅用于冲突判断（比较版本号）
        发送侧直接读取 ISyncLog.get_payload()，无需调用此方法
        """
        pass
    
    @abstractmethod
    def upsert(self, entity: T) -> None:
        """
        [核心] 执行 Upsert (接收端用)
        框架命令：收到数据了，请执行"存在即更新，不存在即插入"
        """
        pass
    
    @abstractmethod
    def delete(self, entity_id: str) -> None:
        """
        [核心] 执行删除 (接收端用)
        框架命令：收到删除指令，请删除该 ID
        """
        pass
    
    # ========== 写日志与原子写（方案 A） ==========
    
    @abstractmethod
    def append_log(self, log: ISyncLog) -> None:
        """
        仅写日志（当日志存储由 provider 管理时可用）
        """
        pass
    
    @abstractmethod
    def upsert_with_log(self, entity: T, log: ISyncLog) -> None:
        """
        在同一原子操作中写入实体并附带日志（Upsert + AppendLog）
        保证数据与日志一致性
        """
        pass
    
    @abstractmethod
    def delete_with_log(self, entity_id: str, log: ISyncLog) -> None:
        """
        在同一原子操作中删除实体并附带日志（Delete + AppendLog）
        保证数据与日志一致性
        """
        pass
