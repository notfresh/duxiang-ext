# 统一日志同步实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 demo-python 实现从时间戳改为序列号，实现冲突标记+手动解决的同步机制

**Architecture:** 各节点维护自己的 local_seq，每次修改实体递增；拉取/推送基于 seq 判断；冲突检测基于 seq 和内容差异

**Tech Stack:** Python, JSON 存储

---

## 文件结构

```
demo-python/
├── interfaces/
│   ├── entity.py       # 修改：增加 get_seq(), conflict_state
│   ├── log.py          # 修改：timestamp → seq，增加 BATCH_CREATE
│   ├── cursor.py       # 修改：timestamp → seq
│   └── provider.py     # 修改：GetChangedLogs 内部逻辑
├── core/
│   ├── client.py       # 修改：seq 游标逻辑
│   ├── server.py       # 修改：seq 游标逻辑
│   ├── engine.py       # 不变
│   ├── dto.py          # 修改：timestamp → seq
│   └── registry.py     # 不变
├── storage/
│   ├── cursor_manager.py  # 修改：timestamp → seq
│   └── json_storage.py   # 不变
└── examples/
    ├── bookmark.py        # 修改：增加 seq, conflict_state
    ├── bookmark_provider.py  # 修改：初始化逻辑，冲突处理
    └── http_transport.py  # 不变
```

---

## Task 1: 更新 ISyncEntity 接口（增加 seq 和冲突状态）

**Files:**
- Modify: `sync-design/demo-python/interfaces/entity.py`

- [ ] **Step 1: 添加冲突状态枚举和 SeqEntity 接口**

```python
# 在 entity.py 末尾添加

class ConflictState(Enum):
    """冲突状态枚举"""
    NONE = "NONE"
    CONFLICT_PENDING = "CONFLICT_PENDING"


class IConflictData(ABC):
    """冲突数据接口"""
    @abstractmethod
    def get_local_version(self) -> dict:
        """获取本地版本数据"""
        pass

    @abstractmethod
    def get_remote_version(self) -> dict:
        """获取对端版本数据"""
        pass

    @abstractmethod
    def get_conflict_time(self) -> int:
        """获取冲突发生时间"""
        pass


class ISeqEntity(ABC):
    """带序列号的实体接口"""
    @abstractmethod
    def get_seq(self) -> int:
        """获取实体版本号（节点本地序列号）"""
        pass

    @abstractmethod
    def get_conflict_state(self) -> ConflictState:
        """获取冲突状态"""
        pass

    @abstractmethod
    def get_conflict_data(self) -> Optional[IConflictData]:
        """获取冲突数据（仅在 CONFLICT_PENDING 时有效）"""
        pass
```

- [ ] **Step 2: 修改 ISyncEntity，继承 ISeqEntity**

```python
class ISyncEntity(ABC, ISeqEntity):
    """任何需要同步的数据对象必须实现此接口"""

    @abstractmethod
    def get_primary_key(self) -> str:
        """获取全局唯一主键"""
        pass

    @abstractmethod
    def get_seq(self) -> int:
        """获取实体版本号（节点本地序列号）"""
        pass

    @abstractmethod
    def get_conflict_state(self) -> ConflictState:
        """获取冲突状态"""
        pass

    @abstractmethod
    def get_conflict_data(self) -> Optional[IConflictData]:
        """获取冲突数据"""
        pass
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/interfaces/entity.py
git commit -m "feat: update ISyncEntity with seq and conflict state"
```

---

## Task 2: 更新 ISyncLog 接口（timestamp → seq，增加 BATCH_CREATE）

**Files:**
- Modify: `sync-design/demo-python/interfaces/log.py`

- [ ] **Step 1: 更新 Operation 枚举，增加 BATCH_CREATE**

```python
class Operation(Enum):
    """操作类型枚举"""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    BATCH_CREATE = "BATCH_CREATE"  # 新增
```

- [ ] **Step 2: 更新 ISyncLog，get_timestamp → get_seq**

```python
class ISyncLog(ABC):
    """同步日志接口 - 日志在写入时就携带实体完整快照"""

    @abstractmethod
    def get_log_id(self) -> str:
        """日志唯一ID（UUID，无序，仅用于标识）"""
        pass

    @abstractmethod
    def get_entity_id(self) -> str:
        """关联的实体ID"""
        pass

    @abstractmethod
    def get_operation(self) -> Operation:
        """操作类型: CREATE | UPDATE | DELETE | BATCH_CREATE"""
        pass

    @abstractmethod
    def get_seq(self) -> int:
        """实体的序列号（节点本地序列号，游标推进依据）"""
        pass

    @abstractmethod
    def get_payload(self) -> Optional[ISyncEntity]:
        """操作瞬间的实体完整快照，DELETE 时为 None"""
        pass

    @abstractmethod
    def to_dict(self) -> dict:
        """序列化为字典"""
        pass

    @classmethod
    @abstractmethod
    def from_dict(cls, data: dict, entity_class: type) -> 'ISyncLog':
        """从字典反序列化"""
        pass
```

- [ ] **Step 3: 添加 IBatchLog 接口**

```python
class IBatchLog(ISyncLog):
    """批量日志接口"""

    @abstractmethod
    def get_entities(self) -> List[ISyncEntity]:
        """获取批量实体列表"""
        pass

    @abstractmethod
    def get_operation(self) -> Operation:
        """固定返回 BATCH_CREATE"""
        pass
```

- [ ] **Step 4: 提交**

```bash
git add sync-design/demo-python/interfaces/log.py
git commit -m "feat: update ISyncLog from timestamp to seq, add BATCH_CREATE"
```

---

## Task 3: 更新游标管理（timestamp → seq）

**Files:**
- Modify: `sync-design/demo-python/interfaces/cursor.py`
- Modify: `sync-design/demo-python/storage/cursor_manager.py`

- [ ] **Step 1: 更新 ISyncCursorManager 接口**

```python
class ISyncCursorManager(ABC):
    """
    游标管理契约
    游标语义："我上次与 peerId 成功同步，处理到的最新序列号"
    按 peerId × entityType 两个维度隔离，各 peer 独立推进，互不影响
    """

    @abstractmethod
    def get_pull_cursor(self, peer_id: str, entity_type: str) -> int:
        """
        Pull 游标：我上次从 peerId 成功拉取到的 seq
        语义：比此序列号小的日志，我还未从对端获取
        """
        pass

    @abstractmethod
    def save_pull_cursor(self, peer_id: str, entity_type: str, seq: int) -> None:
        """
        保存 Pull 游标
        更新时机：数据成功写入本地之后才更新，失败则不前进
        """
        pass

    @abstractmethod
    def get_push_cursor(self, peer_id: str, entity_type: str) -> int:
        """
        Push 游标：我上次成功推给 peerId 的 seq
        语义：比此序列号小的本地日志，我还未推送给对端
        """
        pass

    @abstractmethod
    def save_push_cursor(self, peer_id: str, entity_type: str, seq: int) -> None:
        """
        保存 Push 游标
        更新时机：对端成功 ack 之后才更新，失败则不前进
        """
        pass
```

- [ ] **Step 2: 更新 JsonCursorManager 实现**

```python
# json_storage.py 的存储格式改为：
{
  "local_seq": 10,
  "pull": {
    "peer-b": { "BOOKMARK": 5 }
  },
  "push": {
    "peer-b": { "BOOKMARK": 3 }
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/interfaces/cursor.py sync-design/demo-python/storage/cursor_manager.py
git commit -m "feat: update cursor management from timestamp to seq"
```

---

## Task 4: 更新 DTO（timestamp → seq）

**Files:**
- Modify: `sync-design/demo-python/core/dto.py`

- [ ] **Step 1: 更新 SyncLogDTO**

```python
@dataclass
class SyncLogDTO:
    """
    单条传输日志（wire schema，不直接暴露本地 ISyncLog 接口）
    """
    log_seq: int         # 改为 seq，替代原 logTimestamp
    entity_id: str
    operation: Operation  # CREATE | UPDATE | DELETE | BATCH_CREATE
    payload: Optional[ISyncEntity]  # DELETE 时为 None

    def to_dict(self) -> dict:
        return {
            'logSeq': self.log_seq,
            'entityId': self.entity_id,
            'operation': self.operation.value,
            'payload': self.payload.to_dict() if self.payload else None
        }
```

- [ ] **Step 2: 更新 SyncPullResponse**

```python
@dataclass
class SyncPullResponse:
    """
    Pull 响应包：Server 返回给 Client 的增量数据
    """
    items: List[SyncLogDTO]  # 增量数据列表（按 logSeq 升序）
    next_cursor: int         # 本批 DTO 中最大的 logSeq，Client 用于更新 Pull 游标
    local_seq: int           # Server 的当前 local_seq
```

- [ ] **Step 3: 更新 SyncPushResponse**

```python
@dataclass
class SyncPushResponse:
    """
    Push 响应体：Server 返回给 Client 的处理结果
    """
    success: bool
    server_ack_seq: int  # 本次成功处理的最大 seq
    acked_entity_ids: List[str]
```

- [ ] **Step 4: 提交**

```bash
git add sync-design/demo-python/core/dto.py
git commit -m "feat: update DTO from timestamp to seq"
```

---

## Task 5: 更新 Bookmark 和 BookmarkSyncLog

**Files:**
- Modify: `sync-design/demo-python/examples/bookmark.py`

- [ ] **Step 1: 更新 Bookmark 类**

```python
class Bookmark(ISyncEntity):
    """书签实体"""

    def __init__(self, bookmark_id: str, url: str, title: str,
                 updated_at: int, seq: int = 0,
                 conflict_state: ConflictState = ConflictState.NONE,
                 conflict_data: Optional[dict] = None):
        self.bookmark_id = bookmark_id
        self.url = url
        self.title = title
        self.updated_at = updated_at
        self.seq = seq  # 新增：实体版本号
        self.conflict_state = conflict_state  # 新增
        self.conflict_data = conflict_data    # 新增

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
        return ConflictDataImpl(**self.conflict_data) if self.conflict_data else None

    def to_dict(self) -> dict:
        return {
            'bookmarkId': self.bookmark_id,
            'url': self.url,
            'title': self.title,
            'updatedAt': self.updated_at,
            'seq': self.seq,
            'conflictState': self.conflict_state.value,
            'conflictData': self.conflict_data
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Bookmark':
        conflict_data = data.get('conflictData')
        return cls(
            bookmark_id=data['bookmarkId'],
            url=data['url'],
            title=data['title'],
            updated_at=data['updatedAt'],
            seq=data.get('seq', 0),
            conflict_state=ConflictState(data.get('conflictState', 'NONE')),
            conflict_data=conflict_data
        )
```

- [ ] **Step 2: 更新 BookmarkSyncLog**

```python
class BookmarkSyncLog(ISyncLog):
    """书签同步日志"""

    def __init__(self, log_id: str, entity_id: str, operation: Operation,
                 seq: int, payload: Optional[Bookmark]):
        self.log_id = log_id
        self.entity_id = entity_id
        self.operation = operation
        self.seq = seq  # 改为 seq
        self.payload = payload

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
        return {
            'logId': self.log_id,
            'entityId': self.entity_id,
            'operation': self.operation.value,
            'seq': self.seq,
            'payload': self.payload.to_dict() if self.payload else None
        }

    @classmethod
    def from_dict(cls, data: dict, entity_class: type = Bookmark) -> 'BookmarkSyncLog':
        payload = None
        if data.get('payload'):
            payload = entity_class.from_dict(data['payload'])

        return cls(
            log_id=data['logId'],
            entity_id=data['entityId'],
            operation=Operation(data['operation']),
            seq=data['seq'],
            payload=payload
        )

    @staticmethod
    def create_log(entity_id: str, operation: Operation,
                   payload: Optional[Bookmark], seq: int) -> 'BookmarkSyncLog':
        """工厂方法：创建新日志"""
        return BookmarkSyncLog(
            log_id=str(uuid.uuid4()),
            entity_id=entity_id,
            operation=operation,
            seq=seq,
            payload=payload
        )
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/examples/bookmark.py
git commit -m "feat: update Bookmark with seq and conflict state"
```

---

## Task 6: 更新 BookmarkProvider（初始化逻辑、冲突处理）

**Files:**
- Modify: `sync-design/demo-python/examples/bookmark_provider.py`

- [ ] **Step 1: 添加本地序列号管理**

```python
class BookmarkProvider(ISyncProvider[Bookmark]):

    def __init__(self, storage: JsonStorage, node_id: str):
        self.storage = storage
        self.node_id = node_id
        self.entity_file = f"bookmarks_{node_id}"
        self.log_file = f"sync_log_{node_id}"
        self.meta_file = f"meta_{node_id}"  # 存储 local_seq
        self.entity_class = Bookmark
        self._local_seq = self._load_local_seq()

    def _load_local_seq(self) -> int:
        """加载本地序列号"""
        meta = self.storage.load(self.meta_file)
        return meta.get('local_seq', 0) if meta else 0

    def _save_local_seq(self) -> None:
        """保存本地序列号"""
        meta = self.storage.load(self.meta_file) or {}
        meta['local_seq'] = self._local_seq
        self.storage.save(self.meta_file, meta)

    def _next_seq(self) -> int:
        """获取下一个序列号"""
        seq = self._local_seq
        self._local_seq += 1
        self._save_local_seq()
        return seq
```

- [ ] **Step 2: 更新 GetChangedLogs（无日志时生成 BatchLog）**

```python
def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]:
    """获取增量日志"""
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
    """初始化：扫描实体表，生成 BatchLog"""
    entities_data = self.storage.load(self.entity_file)
    if not entities_data:
        return []

    # 为每个实体分配序列号
    batch_entities = []
    for entity_data in entities_data.values():
        bookmark = Bookmark.from_dict(entity_data)
        bookmark.seq = self._next_seq()
        batch_entities.append(bookmark)

    # 创建 BatchLog
    if not batch_entities:
        return []

    first_entity = batch_entities[0]
    batch_log = BookmarkSyncLog(
        log_id=str(uuid.uuid4()),
        entity_id=first_entity.get_primary_key(),
        operation=Operation.BATCH_CREATE,
        seq=first_entity.seq,
        payload=first_entity  # 第一个实体作为 payload
    )

    # 保存到日志文件
    log_data = {
        'logId': batch_log.log_id,
        'entityId': batch_log.entity_id,
        'operation': batch_log.operation.value,
        'seq': batch_log.seq,
        'entities': [e.to_dict() for e in batch_entities]  # BATCH_CREATE 专用
    }
    logs_data = self.storage.load_list(self.log_file)
    logs_data.append(log_data)
    self.storage.save_list(self.log_file, logs_data)

    # 更新实体表的 seq
    for entity in batch_entities:
        entities_data[entity.get_primary_key()] = entity.to_dict()
    self.storage.save(self.entity_file, entities_data)

    return [batch_log]
```

- [ ] **Step 3: 添加冲突检测和处理**

```python
def upsert(self, entity: Bookmark) -> None:
    """幂等写入，检测冲突"""
    entities = self.storage.load(self.entity_file)
    existing = entities.get(entity.get_primary_key())

    if existing:
        existing_bookmark = Bookmark.from_dict(existing)
        # 检测冲突：seq 不同且内容不同
        if (existing_bookmark.seq != entity.seq and
            existing_bookmark.url != entity.url):
            # 标记冲突
            entity.conflict_state = ConflictState.CONFLICT_PENDING
            entity.conflict_data = {
                'localVersion': existing_bookmark.to_dict(),
                'remoteVersion': entity.to_dict(),
                'conflictTime': int(time.time() * 1000)
            }
            print(f"[CONFLICT] {entity.get_primary_key()}: local seq={existing_bookmark.seq}, remote seq={entity.seq}")

    entities[entity.get_primary_key()] = entity.to_dict()
    self.storage.save(self.entity_file, entities)
```

- [ ] **Step 4: 更新业务层方法（分配 seq）**

```python
def create_bookmark(self, bookmark: Bookmark) -> None:
    """业务方法：创建书签（带日志）"""
    bookmark.seq = self._next_seq()
    log = BookmarkSyncLog.create_log(
        entity_id=bookmark.get_primary_key(),
        operation=Operation.CREATE,
        payload=bookmark,
        seq=bookmark.seq
    )
    self.upsert_with_log(bookmark, log)
    print(f"[CREATE] {bookmark}")

def update_bookmark(self, bookmark: Bookmark) -> None:
    """业务方法：更新书签（带日志）"""
    bookmark.seq = self._next_seq()
    log = BookmarkSyncLog.create_log(
        entity_id=bookmark.get_primary_key(),
        operation=Operation.UPDATE,
        payload=bookmark,
        seq=bookmark.seq
    )
    self.upsert_with_log(bookmark, log)
    print(f"[UPDATE] {bookmark}")
```

- [ ] **Step 5: 提交**

```bash
git add sync-design/demo-python/examples/bookmark_provider.py
git commit -m "feat: update BookmarkProvider with seq management and conflict detection"
```

---

## Task 7: 更新 SyncClient（seq 游标逻辑）

**Files:**
- Modify: `sync-design/demo-python/core/client.py`

- [ ] **Step 1: 更新 pull 方法使用 seq**

```python
def pull(self, peer_id: str, entity_type: str) -> None:
    """pull(peerId, entityType)"""
    provider = self.registry.get_provider(entity_type)

    # 1. 读游标：我上次从这个 peer 成功拉到的时间点
    cursor = self.cursor_manager.get_pull_cursor(peer_id, entity_type)

    # 2. 向对端 Server 请求增量数据
    response = self.transport.get(peer_id, "/sync/pull", {
        'entityType': entity_type,
        'lastCursor': cursor
    })

    if not response.success:
        print(f"[ERR] Pull failed from {peer_id}: {response.error}")
        return

    # 获取实体类，用于反序列化
    entity_class = self._get_entity_class(entity_type)
    package = SyncPullResponse.from_dict(response.data['data'], entity_class)

    # 3. 按 seq 升序应用数据（幂等）
    for item in package.items:
        if item.operation.value == 'DELETE':
            provider.delete(item.entity_id)
        else:
            # 冲突检测由 provider.upsert 处理
            provider.upsert(item.payload)

    # 4. 数据写入本地成功后，才推进游标（使用 remote 的 local_seq）
    if package.local_seq > cursor:
        self.cursor_manager.save_pull_cursor(peer_id, entity_type, package.local_seq)
        print(f"[OK] Pull from {peer_id}: {len(package.items)} items, cursor -> {package.local_seq}")
```

- [ ] **Step 2: 更新 push 方法使用 seq**

```python
def push(self, peer_id: str, entity_type: str) -> None:
    """push(peerId, entityType)"""
    provider = self.registry.get_provider(entity_type)

    # 1. 读游标：我上次成功推给这个 peer 的时间点
    cursor = self.cursor_manager.get_push_cursor(peer_id, entity_type)

    # 2. 查本地在游标之后产生的变更日志
    logs = provider.get_changed_logs(cursor)

    if not logs:
        return

    # 3. 组装 SyncLogDTO
    items = []
    for log in logs:
        item = SyncLogDTO(
            log_seq=log.get_seq(),
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

    # 5. 只有对端 success=true 时，才按 serverAckSeq 推进游标
    if response.success and response.data.get('success'):
        ack_seq = response.data.get('serverAckSeq', 0)
        self.cursor_manager.save_push_cursor(peer_id, entity_type, ack_seq)
        print(f"[OK] Push to {peer_id}: {len(items)} items, cursor -> {ack_seq}")
    else:
        print(f"[ERR] Push failed to {peer_id}, will retry from cursor: {cursor}")
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/core/client.py
git commit -m "feat: update SyncClient to use seq instead of timestamp"
```

---

## Task 8: 更新 SyncServer（seq 逻辑）

**Files:**
- Modify: `sync-design/demo-python/core/server.py`

- [ ] **Step 1: 更新 handle_pull 使用 seq**

```python
def handle_pull(self, entity_type: str, last_cursor: int) -> SyncPullResponse:
    """handlePull(entityType, lastCursor)"""
    provider = self.registry.get_provider(entity_type)

    # 1. 查本地在 lastCursor 之后的变更日志
    logs = provider.get_changed_logs(last_cursor)

    # 2. 组装传输 DTO
    items: List[SyncLogDTO] = []
    for log in logs:
        item = SyncLogDTO(
            log_seq=log.get_seq(),
            entity_id=log.get_entity_id(),
            operation=log.get_operation(),
            payload=log.get_payload()
        )
        items.append(item)

    # 3. 设置 next_cursor
    next_cursor = last_cursor
    if items:
        next_cursor = max(item.log_seq for item in items)

    # 获取 local_seq（从 provider 的 meta 文件）
    local_seq = provider.get_local_seq()

    return SyncPullResponse(
        items=items,
        next_cursor=next_cursor,
        local_seq=local_seq
    )
```

- [ ] **Step 2: 更新 handle_push 使用 seq**

```python
def handle_push(self, entity_type: str, items: List[SyncLogDTO]) -> SyncPushResponse:
    """handlePush(entityType, items)"""
    provider = self.registry.get_provider(entity_type)
    max_seq = 0
    acked_ids: List[str] = []

    for item in items:
        try:
            if item.operation.value == 'DELETE':
                provider.delete(item.entity_id)
            else:
                # 冲突检测由 provider.upsert 处理
                provider.upsert(item.payload)

            acked_ids.append(item.entity_id)
            if item.log_seq > max_seq:
                max_seq = item.log_seq

        except Exception as error:
            print(f"ERR Failed to apply item: {item.entity_id}, error: {error}")
            return SyncPushResponse(
                success=False,
                server_ack_seq=max_seq,
                acked_entity_ids=acked_ids
            )

    return SyncPushResponse(
        success=True,
        server_ack_seq=max_seq,
        acked_entity_ids=acked_ids
    )
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/core/server.py
git commit -m "feat: update SyncServer to use seq instead of timestamp"
```

---

## Task 9: 测试验证

**Files:**
- Create: `sync-design/demo-python/test_seq_sync.py`

- [ ] **Step 1: 编写测试脚本**

```python
"""测试序列号同步机制"""
import os
import shutil
from storage.json_storage import JsonStorage
from examples.bookmark_provider import BookmarkProvider
from examples.bookmark import Bookmark
from core.client import SyncClient
from core.server import SyncServer
from core.engine import SyncEngine, SyncEngineOptions
from core.registry import SyncRegistry
from storage.cursor_manager import JsonCursorManager
from examples.http_transport import HttpTransport


def cleanup():
    """清理测试数据"""
    for f in ['bookmarks_nodeA', 'bookmarks_nodeB', 'sync_log_nodeA',
              'sync_log_nodeB', 'cursors_nodeA', 'cursors_nodeB',
              'meta_nodeA', 'meta_nodeB']:
        for node in ['A', 'B']:
            path = f"{f}_{node}"
            if os.path.exists(path):
                shutil.rmtree(path)


def test_initial_sync():
    """测试首次同步（无日志场景）"""
    cleanup()

    # 模拟两个节点
    storageA = JsonStorage('.')
    storageB = JsonStorage('.')

    providerA = BookmarkProvider(storageA, 'nodeA')
    providerB = BookmarkProvider(storageB, 'nodeB')

    # 在 Node A 创建一些书签
    providerA.create_bookmark(Bookmark('bk-1', 'http://a.com', 'A', 100))
    providerA.create_bookmark(Bookmark('bk-2', 'http://b.com', 'B', 200))

    print("\n=== Node A 本地数据 ===")
    for bk in providerA.list_all():
        print(f"  {bk}, seq={bk.seq}")

    # 模拟首次同步（Node B 从 Node A 拉取）
    # 正常流程应该是网络请求，这里简化处理直接调用
    logs = providerA.get_changed_logs(0)  # cursor=0，首次同步

    print(f"\n=== Node A 返回的日志（首次同步）===")
    for log in logs:
        print(f"  log_id={log.get_log_id()}, seq={log.get_seq()}, op={log.get_operation().value}")

    # 应用到 Node B
    for log in logs:
        if log.get_operation().value == 'BATCH_CREATE':
            # BATCH_CREATE 需要特殊处理
            # 从 log 的 entities 字段获取实体列表（需要在 BookmarkSyncLog 中添加支持）
            pass
        else:
            providerB.upsert(log.get_payload())

    print("\n=== Node B 本地数据 ===")
    for bk in providerB.list_all():
        print(f"  {bk}, seq={bk.seq}")

    assert len(providerB.list_all()) == 2, "应该同步到 2 个书签"
    print("\n[PASS] 首次同步测试通过")


def test_seq_increment():
    """测试序列号递增"""
    cleanup()

    storage = JsonStorage('.')
    provider = BookmarkProvider(storage, 'node')

    assert provider._local_seq == 0

    bk1 = Bookmark('bk-1', 'http://a.com', 'A', 100)
    provider.create_bookmark(bk1)
    assert provider._local_seq == 1

    bk2 = Bookmark('bk-2', 'http://b.com', 'B', 200)
    provider.create_bookmark(bk2)
    assert provider._local_seq == 2

    print("\n[PASS] 序列号递增测试通过")


if __name__ == '__main__':
    test_seq_increment()
    test_initial_sync()
```

- [ ] **Step 2: 运行测试**

```bash
cd sync-design/demo-python
python test_seq_sync.py
```

- [ ] **Step 3: 提交**

```bash
git add sync-design/demo-python/test_seq_sync.py
git commit -m "test: add seq-based sync tests"
```

---

## Task 10: 更新 demo.py（整合测试）

**Files:**
- Modify: `sync-design/demo-python/demo.py`

- [ ] **Step 1: 更新演示脚本**

根据新的 seq 机制更新 demo.py，展示：
1. 各节点维护自己的 local_seq
2. 首次同步时生成 BatchLog
3. 后续增量同步使用 seq

- [ ] **Step 2: 提交**

```bash
git add sync-design/demo-python/demo.py
git commit -m "feat: update demo.py for seq-based sync"
```

---

## 实现顺序

1. Task 1-2: 更新接口（entity, log）
2. Task 3: 更新游标管理
3. Task 4: 更新 DTO
4. Task 5-6: 更新实体和 Provider（核心逻辑）
5. Task 7-8: 更新 Client 和 Server
6. Task 9: 测试验证
7. Task 10: 更新 demo

---

## 验证命令

```bash
cd sync-design/demo-python
python test_seq_sync.py
python demo.py
```