# UniversalSyncEngine - Python Demo

基于时间的 P2P 增量同步引擎的 Python 实现示例。

## 📁 项目结构

```
demo-python/
├── interfaces/          # 核心接口定义
│   ├── entity.py       # ISyncEntity - 实体接口
│   ├── log.py          # ISyncLog - 日志接口
│   ├── provider.py     # ISyncProvider - 数据提供者接口
│   ├── cursor.py       # ISyncCursorManager - 游标管理接口
│   └── transport.py    # INetworkTransport - 网络传输接口
│
├── core/               # 核心组件实现
│   ├── dto.py          # 数据传输对象 (SyncLogDTO, SyncPullResponse, SyncPushResponse)
│   ├── registry.py     # SyncRegistry - 注册中心
│   ├── client.py       # SyncClient - 主动方（持有游标）
│   ├── server.py       # SyncServer - 被动方（无状态）
│   └── engine.py       # SyncEngine - 编排层
│
├── storage/            # 存储层实现
│   ├── json_storage.py       # JSON 文件存储
│   └── cursor_manager.py     # 基于 JSON 的游标管理器
│
├── examples/           # 示例实现
│   ├── bookmark.py            # Bookmark 实体和日志
│   ├── bookmark_provider.py  # BookmarkProvider 实现
│   └── mock_transport.py     # Mock 网络传输层
│
├── demo.py            # 可运行的演示脚本
└── README.md          # 本文件
```

## 🚀 快速开始

### 运行 Demo

```bash
cd sync-design/demo-python
python demo.py
```

Demo 将演示以下场景：
1. **基本的双向同步** - 两个节点互相 pull 数据
2. **冲突解决（LWW）** - Last-Write-Wins 策略
3. **删除操作同步** - DELETE 操作的传播
4. **Push 操作** - 主动推送变更到对端
5. **syncWithPeer** - Pull + Push 组合操作

### 查看生成的数据

运行后会在 `./data/` 目录下生成 JSON 文件：

```
data/
├── node-a/
│   ├── bookmarks_node-a.json    # 节点 A 的书签数据
│   ├── sync_log_node-a.json     # 节点 A 的同步日志
│   └── cursors_node-a.json      # 节点 A 的游标
│
└── node-b/
    ├── bookmarks_node-b.json
    ├── sync_log_node-b.json
    └── cursors_node-b.json
```

## 🏗️ 核心设计

### 1. 接口编程

所有核心逻辑基于接口定义，业务方只需实现 `ISyncProvider` 即可接入同步网络：

```python
class ISyncProvider(ABC, Generic[T]):
    def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]
    def get_entity_by_id(self, entity_id: str) -> Optional[T]
    def upsert(self, entity: T) -> None
    def delete(self, entity_id: str) -> None
    
    # 方案 A: 原子写入方法
    def append_log(self, log: ISyncLog) -> None
    def upsert_with_log(self, entity: T, log: ISyncLog) -> None
    def delete_with_log(self, entity_id: str, log: ISyncLog) -> None
```

### 2. P2P 架构

每个节点同时具备两种身份：

| 身份 | 职责 | 是否持有游标 |
|------|------|-------------|
| **Client（主动方）** | 发起 pull / push | ✅ 是 |
| **Server（被动方）** | 响应请求 | ❌ 否（无状态） |

### 3. 核心原则

- **日志即快照**: `ISyncLog` 在写入时就携带实体完整快照
- **游标 = log_timestamp**: 游标基于日志时间戳，不是实体版本号
- **Client 持有游标**: 每个节点管理自己对每个 peer 的同步进度
- **Server 无状态**: 纯函数式，可水平扩展
- **LWW 冲突解决**: 接收方统一执行 Last-Write-Wins

## 📝 使用示例

### 创建一个同步节点

```python
from storage import JsonStorage, JsonCursorManager
from core import SyncRegistry, SyncClient, SyncServer, SyncEngine, SyncEngineOptions
from examples import BookmarkProvider, MockTransport

# 1. 创建存储和游标管理器
storage = JsonStorage("./data/node-a")
cursor_manager = JsonCursorManager(storage, "node-a")

# 2. 创建注册中心并注册 Provider
registry = SyncRegistry()
provider = BookmarkProvider(storage, "node-a")
registry.register("BOOKMARK", provider)

# 3. 创建 Client 和 Server
transport = MockTransport()
client = SyncClient(registry, cursor_manager, transport)
server = SyncServer(registry)

# 4. 创建引擎
options = SyncEngineOptions(client_enabled=True, server_enabled=True)
engine = SyncEngine(options, client, server)

# 5. 注册对等节点
engine.register_peer("node-b")
```

### 业务操作（带日志）

```python
from examples import Bookmark
import time

# 创建书签（自动写入日志）
provider.create_bookmark(Bookmark(
    bookmark_id="bk-1",
    url="https://github.com",
    title="GitHub",
    updated_at=int(time.time() * 1000)
))

# 更新书签
provider.update_bookmark(Bookmark(
    bookmark_id="bk-1",
    url="https://github.com",
    title="GitHub - New Title",
    updated_at=int(time.time() * 1000)
))

# 删除书签
provider.delete_bookmark("bk-1")
```

### 同步操作

```python
# Pull: 从对端拉取增量数据
engine.pull("node-b", "BOOKMARK")

# Push: 推送本地变更到对端
engine.push("node-b", "BOOKMARK")

# Sync: Pull + Push 组合
engine.sync_with_peer("node-b", "BOOKMARK")

# Pull All: 从所有已知 peer 拉取
engine.pull_all("BOOKMARK")
```

## 🔑 关键特性

### 1. 增量同步

只传输游标之后的变更：

```python
# Provider 实现
def get_changed_logs(self, last_cursor: int) -> List[ISyncLog]:
    logs = load_all_logs()
    filtered = [log for log in logs if log.get_timestamp() > last_cursor]
    return sorted(filtered, key=lambda x: x.get_timestamp())
```

### 2. 冲突解决（LWW）

```python
# Client.pull 和 Server.handle_push 中的逻辑完全对称
local = provider.get_entity_by_id(item.entity_id)
if local is None or local.get_version() < item.payload.get_version():
    provider.upsert(item.payload)
# else: 本地版本更新，丢弃对端旧数据
```

### 3. 游标管理

```python
# Pull 游标：我上次从 peer_id 成功拉取到的时间戳
cursor = cursor_manager.get_pull_cursor("node-b", "BOOKMARK")

# 数据写入成功后才推进
cursor_manager.save_pull_cursor("node-b", "BOOKMARK", new_cursor)
```

### 4. 原子写入（方案 A）

```python
# 在同一操作中写入实体和日志，保证一致性
def upsert_with_log(self, entity: Bookmark, log: ISyncLog) -> None:
    # 实际应在同一事务中执行
    self.upsert(entity)
    self.append_log(log)
```

## 🧪 测试场景

Demo 中包含以下测试场景：

1. **双向同步**: 节点 A 创建数据 → 节点 B pull → 节点 B 创建数据 → 节点 A pull
2. **冲突解决**: 两节点创建相同 ID、不同内容的实体 → LWW 保留最新版本
3. **删除同步**: 节点 A 删除实体 → 节点 B pull → 节点 B 也删除
4. **Push 操作**: 节点 A 主动 push 变更到节点 B
5. **组合同步**: syncWithPeer 一次性完成 pull + push

## 📊 数据格式示例

### 书签实体 (bookmarks_node-a.json)

```json
{
  "bk-1": {
    "bookmarkId": "bk-1",
    "url": "https://github.com",
    "title": "GitHub",
    "updatedAt": 1713340000100
  }
}
```

### 同步日志 (sync_log_node-a.json)

```json
[
  {
    "logId": "log-uuid-1",
    "entityId": "bk-1",
    "operation": "CREATE",
    "timestamp": 1713340000100,
    "payload": {
      "bookmarkId": "bk-1",
      "url": "https://github.com",
      "title": "GitHub",
      "updatedAt": 1713340000100
    }
  },
  {
    "logId": "log-uuid-2",
    "entityId": "bk-1",
    "operation": "DELETE",
    "timestamp": 1713340010000,
    "payload": null
  }
]
```

### 游标 (cursors_node-a.json)

```json
{
  "pull": {
    "node-b": {
      "BOOKMARK": 1713340005000
    }
  },
  "push": {
    "node-b": {
      "BOOKMARK": 1713340005000
    }
  }
}
```

## 🎯 扩展建议

1. **实际数据库**: 替换 `JsonStorage` 为 SQLite / PostgreSQL
2. **HTTP Transport**: 实现真实的 HTTP 客户端/服务器
3. **批量处理**: 添加分页和批量大小限制
4. **错误重试**: 添加指数退避重试机制
5. **监控指标**: 添加同步延迟、冲突率等指标
6. **压缩传输**: 添加 gzip 压缩支持
7. **增量清理**: 定期清理过期日志

## 📖 参考文档

详细设计文档: [feat-sync-260416-基于时间的design.md](../feat-sync-260416-基于时间的design.md)

## 📄 许可证

本示例代码仅用于演示目的。
