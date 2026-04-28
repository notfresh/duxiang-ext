"""游标管理接口定义"""
from abc import ABC, abstractmethod


class ISyncCursorManager(ABC):
    """
    游标管理契约
    游标语义："我上次与 peerId 成功同步，处理到的最新日志时间戳"
    按 peerId × entityType 两个维度隔离，各 peer 独立推进，互不影响
    """
    
    @abstractmethod
    def get_pull_cursor(self, peer_id: str, entity_type: str) -> int:
        """
        Pull 游标：我上次从 peerId 成功拉取到的 log_timestamp
        语义：比此时间戳更新的日志，我还未从对端获取
        """
        pass
    
    @abstractmethod
    def save_pull_cursor(self, peer_id: str, entity_type: str, timestamp: int) -> None:
        """
        保存 Pull 游标
        更新时机：数据成功写入本地之后才更新，失败则不前进
        """
        pass
    
    @abstractmethod
    def get_push_cursor(self, peer_id: str, entity_type: str) -> int:
        """
        Push 游标：我上次成功推给 peerId 的 log_timestamp
        语义：比此时间戳更新的本地日志，我还未推送给对端
        """
        pass
    
    @abstractmethod
    def save_push_cursor(self, peer_id: str, entity_type: str, timestamp: int) -> None:
        """
        保存 Push 游标
        更新时机：对端成功 ack 之后才更新，失败则不前进
        """
        pass
