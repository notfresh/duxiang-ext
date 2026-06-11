"""基于 JSON 的游标管理器实现"""
from interfaces import ISyncCursorManager
from .json_storage import JsonStorage


class JsonCursorManager(ISyncCursorManager):
    """
    基于 JSON 文件的游标管理器

    借鉴 TCP 序列号机制：游标值是节点本地序列号 (seq)，
    各节点独立维护，不需要时钟同步。

    游标存储格式：
    {
        "pull": {
            "peer-a": {
                "BOOKMARK": 5
            }
        },
        "push": {
            "peer-a": {
                "BOOKMARK": 3
            }
        }
    }
    """

    def __init__(self, storage: JsonStorage, node_id: str):
        self.storage = storage
        self.node_id = node_id
        self.filename = f"cursors_{node_id}"
        self._cursors = self._load_cursors()

    def _load_cursors(self) -> dict:
        """加载游标数据"""
        data = self.storage.load(self.filename)
        if not data:
            data = {"pull": {}, "push": {}}
        return data

    def _save_cursors(self) -> None:
        """保存游标数据"""
        self.storage.save(self.filename, self._cursors)

    def get_pull_cursor(self, peer_id: str, entity_type: str) -> int:
        """获取 Pull 游标（节点本地 seq）"""
        return self._cursors.get("pull", {}).get(peer_id, {}).get(entity_type, 0)

    def save_pull_cursor(self, peer_id: str, entity_type: str, seq: int) -> None:
        """保存 Pull 游标（节点本地 seq）"""
        if "pull" not in self._cursors:
            self._cursors["pull"] = {}
        if peer_id not in self._cursors["pull"]:
            self._cursors["pull"][peer_id] = {}

        self._cursors["pull"][peer_id][entity_type] = seq
        self._save_cursors()

    def get_push_cursor(self, peer_id: str, entity_type: str) -> int:
        """获取 Push 游标（节点本地 seq）"""
        return self._cursors.get("push", {}).get(peer_id, {}).get(entity_type, 0)

    def save_push_cursor(self, peer_id: str, entity_type: str, seq: int) -> None:
        """保存 Push 游标（节点本地 seq）"""
        if "push" not in self._cursors:
            self._cursors["push"] = {}
        if peer_id not in self._cursors["push"]:
            self._cursors["push"][peer_id] = {}

        self._cursors["push"][peer_id][entity_type] = seq
        self._save_cursors()
