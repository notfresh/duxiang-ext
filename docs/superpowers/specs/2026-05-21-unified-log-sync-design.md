# 统一日志同步设计

## 背景

原有设计存在"快照 + 日志"混合的复杂性，以及"首次同步存量数据无日志"的问题。

本设计将所有数据统一为日志格式，简化处理逻辑。

---

## 核心理念

**日志即快照，快照即批量日志**。

不再区分快照和增量日志，统一成一种结构。初始化时生成的批量数据，是 BatchLog，不是快照。

---

## 日志类型

| 类型 | 说明 | operation | 使用场景 |
|------|------|-----------|---------|
| SingleLog | 正常增量日志 | CREATE / UPDATE / DELETE | 日常变更同步 |
| BatchLog | 批量初始化日志 | BATCH_CREATE | 首次同步存量数据 |

---

## 数据结构

### ISyncLog 接口

```typescript
Interface ISyncLog {
    GetLogId():      String;        // UUID，唯一标识
    GetEntityId():   String;        // 关联实体ID
    GetOperation():  Enum;          // CREATE | UPDATE | DELETE | BATCH_CREATE
    GetTimestamp():  Long;          // 日志写入时间，游标推进依据
    GetPayload():    ISyncEntity;   // 操作瞬间的实体快照（DELETE 时为 null）
}
```

### BatchLog 扩展

```typescript
Interface IBatchLog extends ISyncLog {
    GetOperation(): "BATCH_CREATE"; // 固定为 BATCH_CREATE
    GetEntities():  List<ISyncEntity>; // 批量实体列表
    GetPayload():   ISyncEntity;    // 第一个实体（或 null）
}
```

**存储格式**：

```json
// SingleLog（普通日志）
{
  "logId": "log-a1",
  "entityId": "bk-7f3a",
  "operation": "UPDATE",
  "timestamp": 1713340005000,
  "payload": {"bookmarkId": "bk-7f3a", "url": "...", "updatedAt": 1713340005000}
}

// BatchLog（批量日志）
{
  "logId": "log-batch-001",
  "operation": "BATCH_CREATE",
  "timestamp": 1713340000000,
  "entities": [
    {"bookmarkId": "bk-1", "url": "http://a.com", "updatedAt": 1713339900000},
    {"bookmarkId": "bk-2", "url": "http://b.com", "updatedAt": 1713340010000}
  ]
}
```

---

## Provider 接口

```typescript
Interface ISyncProvider<T extends ISyncEntity> {

    // 获取增量日志
    // 内部逻辑：
    //   - 如果有日志：返回 cursor 之后的增量 SingleLog
    //   - 如果没有日志：扫描实体表，生成 BatchLog 返回
    Function GetChangedLogs(lastCursor: Long): List<ISyncLog>;

    // 查询本地实体（仅用于冲突判断）
    Function GetEntityById(entityId: String): T;

    // 幂等写入
    Function Upsert(entity: T): Void;

    // 删除
    Function Delete(entityId: String): Void;

    // 写日志（业务层调用）
    Function AppendLog(log: ISyncLog): Void;

    // 单条写入 + 写日志（原子操作）
    Function UpsertWithLog(entity: T, log: ISyncLog): Void;

    // 单条删除 + 写日志（原子操作）
    Function DeleteWithLog(entityId: String, log: ISyncLog): Void;

    // 初始化批量日志（内部使用）
    Function CreateBatchLog(entities: List<T>, timestamp: Long): ISyncLog;
}
```

---

## 同步流程

### 首次同步（cursor = 0）

```
Client                         Server Provider
  │                               │
  │  pull(cursor=0) ────────────►│
  │                               │ GetChangedLogs(0)
  │                               │   → 发现没有日志
  │                               │   → 扫描实体表（如 bookmarks）
  │                               │   → 生成 BatchLog（包含所有存量实体）
  │                               │   → 保存到日志文件
  │◄──────────────────────────────│ 返回 BatchLog
  │                               │
  │  [处理数据]                   │
  │   - 遍历 BatchLog.entities    │
  │   - 每条实体执行 Upsert       │
  │                               │
  │  SavePullCursor(max_timestamp)│  ← 推进到最大时间戳
```

### 后续同步（cursor > 0）

```
Client                         Server Provider
  │                               │
  │  pull(cursor=1000) ──────────►│
  │                               │ GetChangedLogs(1000)
  │                               │   → 有日志，直接返回增量
  │◄──────────────────────────────│ 返回 [SingleLog...]
  │                               │
  │  SavePullCursor(next_cursor)   │
```

---

## 压缩机制

### SingleLog 压缩为 BatchLog

当 SingleLog 积累到一定数量时，可压缩为 BatchLog 减少存储和传输量。

**压缩条件**：
- 日志数量超过阈值（默认 100 条）
- 仅压缩历史日志（cursor 之前的日志）

**压缩逻辑**：
```
input:
  SingleLog: {entityId:"bk-1", op:"UPDATE", timestamp:100, payload:{...}}
  SingleLog: {entityId:"bk-2", op:"UPDATE", timestamp:101, payload:{...}}
  SingleLog: {entityId:"bk-3", op:"UPDATE", timestamp:102, payload:{...}}

output:
  BatchLog: {
    logId: "log-batch-001",
    operation: "BATCH_CREATE",
    timestamp: 102,  // 取最大时间戳
    entities: [{bk-1的当前状态}, {bk-2的当前状态}, {bk-3的当前状态}]
  }
```

**注意**：
- 压缩后丢失 UPDATE/DELETE 信息，变为 CREATE
- 仅用于历史日志清理，不适用于近期日志
- 压缩前应验证实体当前状态

---

## 游标管理

**Pull 游标**：数据成功写入后更新
**Push 游标**：对端 ack 后更新

```
游标语义：我上次与 peerId 成功同步，处理到的最新日志时间戳

存储结构：
{
  "pull": { "peer-a": { "BOOKMARK": 1713340005000 } },
  "push": { "peer-a": { "BOOKMARK": 1713340005000 } }
}
```

---

## 冲突解决

LWW（Last-Write-Wins），以 `entity.updatedAt` 为版本号。

```python
local = provider.get_entity_by_id(item.entity_id)
if local is None or local.updatedAt < incoming.updatedAt:
    provider.upsert(incoming)
# else: 本地版本更新，丢弃对端数据
```

---

## 数据流总结

```
时间轴 ──────────────────────────────────────────────────────►

  初始化（cursor=0）              后续同步（cursor>0）
       │                               │
       ▼                               ▼
  生成 BatchLog                直接返回 SingleLog
  (包含所有存量)               (增量变更)
```

---

## 与原设计的对比

| 项目 | 原设计 | 新设计 |
|------|--------|--------|
| 数据格式 | 快照 + 日志混合 | 统一为日志 |
| 初始化 | 需要生成快照文件 | 生成 BatchLog，无需额外文件 |
| 首次同步 | 快照 + 日志合并 | 直接返回 BatchLog |
| 复杂度 | 高（两种格式两个路径） | 低（统一格式） |

---

## 实现要点

1. **Provider 内部处理初始化逻辑**：检测到没有日志时，自动触发批量生成
2. **统一日志格式**：BatchLog 只是多个实体的包装，本质还是日志
3. **游标推进**：首次同步后游标为 max(timestamp)，后续正常增量同步
4. **压缩时机**：作为后台任务，定期清理和压缩历史日志

---

## 文件结构（Python 实现）

```
demo-python/
├── interfaces/
│   ├── log.py          # ISyncLog, BatchLog 定义
│   └── provider.py     # ISyncProvider 接口
├── storage/
│   └── json_storage.py # 存储实现
└── examples/
    └── bookmark_provider.py  # BookmarkProvider 实现
```