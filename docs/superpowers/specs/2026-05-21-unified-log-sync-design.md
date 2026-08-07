# 统一日志同步设计

## 背景

原有设计存在"快照 + 日志"混合的复杂性，以及"首次同步存量数据无日志"的问题。

本设计将所有数据统一为日志格式，简化处理逻辑。

**核心变化**：不用时间戳作为游标，改用**本地序列号**，各节点独立维护，不需要时钟同步。

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

### 存储理念：全量快照

**日志 payload = 完整实体快照**，不是 patch。

每条日志记录的是操作瞬间的完整实体状态（类似 git commit），不是增量字段。原因：

1. **单条小数据**：Bookmark 等实体数据量小，全量传输开销可接受
2. **接收端逻辑简单**：直接 upsert，无需字段级别合并
3. **幂等性保证**：重复推送无害，覆盖就行
4. **DELETE 场景**：payload 为 null，但日志本身保留，对端才知道要删

### ISyncLog 接口

```typescript
Interface ISyncLog {
    GetLogId():      String;        // UUID，唯一标识
    GetEntityId():   String;        // 关联实体ID（来自 ISyncEntity.GetPrimaryKey()）
    GetOperation():  Enum;          // CREATE | UPDATE | DELETE | BATCH_CREATE
    GetSeq():        Long;          // 实体的序列号（节点本地序列号，游标推进依据）
    GetPayload():    ISyncEntity;   // 操作瞬间的实体完整快照（DELETE 时为 null）
}
```

**注意**：`seq` 替代了原设计中的 `timestamp`，不再依赖时间戳。

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
  "seq": 3,
  "payload": {"bookmarkId": "bk-7f3a", "url": "...", "seq": 3}
}

// BatchLog（批量日志）
{
  "logId": "log-batch-001",
  "operation": "BATCH_CREATE",
  "seq": 0,
  "entities": [
    {"bookmarkId": "bk-1", "url": "http://a.com", "seq": 0},
    {"bookmarkId": "bk-2", "url": "http://b.com", "seq": 1}
  ]
}
```

### 实体唯一性 ID

**原则：实体唯一性ID由业务方自行实现，框架不生成。**

不同业务场景适用不同的 ID 策略：

| 场景 | 推荐 ID 策略 | 说明 |
|------|-------------|------|
| 书签/URL | `hash(url)` | URL 唯一确定性好，适合哈希 |
| 数据库自增 | `uuid()` | 传统做法，跨库可能冲突 |
| 分布式 | Snowflake ID | 需要外部服务 |

**书签场景示例**：

```typescript
class Bookmark implements ISyncEntity {
    url: String;
    title: String;
    updatedAt: Long;

    // 唯一性ID = URL的哈希值
    GetPrimaryKey(): String {
        return hash(this.url);  // SHA256(url) 取前16位
    }

    GetVersion(): Long { return this.updatedAt; }
    GetEntityType(): String { return "BOOKMARK"; }
}
```

**为什么用 hash(url)**：
- 确定性：相同 URL 生成相同 ID，不依赖中心化服务
- 一致性：多端独立生成相同 ID，天然同步
- 简单：不需要查询或协调

框架只调用 `GetPrimaryKey()`，不关心具体生成算法。

---

## 序列号管理

**借鉴 TCP 序列号机制**：各节点维护自己的本地序列号，不需要时钟同步。

### 核心概念

```
每个节点维护：
  - local_seq_X    ：自己的序列号（每次修改实体，+1）
  - pull_cursor[X→Y]：Y上次从X拉到的序列号
  - push_cursor[X→Y]：X上次推给Y且被ack的序列号

实体版本：
  - 每个实体维护自己的 seq 字段（当前所属节点的 local_seq）
  - seq 只在实体所属节点递增，传播到其他节点后不变
```

### 存储结构

```json
// Node A 的游标存储
{
  "local_seq": 10,
  "pull": {
    "peer-b": { "BOOKMARK": 5 }
  },
  "push": {
    "peer-b": { "BOOKMARK": 3 }
  }
}

// 实体的序列号
{
  "bookmarkId": "bk-7f3a",
  "url": "http://...",
  "title": "...",
  "seq": 7,           // Node A 的本地序列号
  "updatedAt": 1713340005000  // 保留，仅用于冲突判断
}
```

### 拉取流程（B 拉取 A）

```
B → A：pull(peer_seq = pull_cursor[B→A] = 2)

A 检查自己的实体：
  - bk-1: seq=1 ≤ 2，跳过
  - bk-2: seq=3 > 2，返回
  - bk-3: seq=5 > 2，返回

A ← 返回：[bk-2, bk-3] + local_seq_A = 5

B 更新：pull_cursor[B→A] = 5
```

### 推送流程（A 推送给 B）

```
A → B：push(peer_seq = push_cursor[A→B] = 2)

A 检查自己的实体：
  - bk-1: seq=1 ≤ 2，跳过
  - bk-2: seq=3 > 2，返回
  - bk-3: seq=5 > 2，返回

B ← 返回：ack + ack_seq = local_seq_B = 5

A 更新：push_cursor[A→B] = 5
```

### 序列号分配时机

```
业务层修改实体时：
1. entity.seq = local_seq（当前节点的序列号）
2. local_seq += 1
3. 记录日志（含 entity.seq）

初始化时：
1. local_seq = 0
2. 扫描存量实体，设置 entity.seq = local_seq，local_seq++
3. 生成 BatchLog（包含所有存量实体）
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
  │  pull(cursor=0) ────────────► │
  │                               │ GetChangedLogs(0)
  │                               │   → 发现没有日志
  │                               │   → 扫描实体表，分配 local_seq
  │                               │   → 生成 BatchLog（包含所有存量实体）
  │                               │   → 保存到日志文件
  │◄──────────────────────────────│ 返回 BatchLog + local_seq
  │                               │
  │  [处理数据]                    │
  │   - 遍历 BatchLog.entities    │
  │   - 每条实体执行 Upsert        │
  │                               │
  │  SavePullCursor(local_seq)    │  ← 推进到最大 seq
```

### 后续同步（cursor > 0）

```
Client                         Server Provider
  │                               │
  │  pull(cursor=5) ────────────►│
  │                               │ GetChangedLogs(5)
  │                               │   → 有日志，返回 seq > 5 的增量
  │◄──────────────────────────────│ 返回 [SingleLog...] + local_seq
  │                               │
  │  SavePullCursor(local_seq)    │
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
  SingleLog: {entityId:"bk-1", op:"UPDATE", seq:100, payload:{...}}
  SingleLog: {entityId:"bk-2", op:"UPDATE", seq:101, payload:{...}}
  SingleLog: {entityId:"bk-3", op:"UPDATE", seq:102, payload:{...}}

output:
  BatchLog: {
    logId: "log-batch-001",
    operation: "BATCH_CREATE",
    seq: 102,  // 取最大 seq
    entities: [{bk-1的当前状态}, {bk-2的当前状态}, {bk-3的当前状态}]
  }
```

**注意**：
- 压缩后丢失 UPDATE/DELETE 信息，变为 CREATE
- 仅用于历史日志清理，不适用于近期日志
- 压缩前应验证实体当前状态

---

## 冲突解决

**冲突标记 + 手动解决**：不自动覆盖，标记冲突由用户决定。

### 冲突检测

当接收到的数据与本地实体"序列号不同、内容不同"时，判定为冲突：

```
场景：同一实体在两个节点都有变更

Node A:  {id: "bk-1", title: "A", seq: 1}  ← A 的实体，seq=1
Node B:  {id: "bk-1", title: "B", seq: 5}  ← B 的实体，seq=5

同步时：
  - 两者 seq 不同 → 冲突（两方都修改过）
  - 两者内容不同 → 冲突
```

### 冲突处理逻辑

```python
incoming = 获取到的数据
local = provider.get_entity_by_id(item.entity_id)

if local is None:
    # 本地没有，直接写入
    provider.upsert(incoming)
elif local.seq == incoming.seq and local.content == incoming.content:
    # 完全相同，无冲突，直接写入（幂等）
    provider.upsert(incoming)
else:
    # 冲突：序列号或内容不一致
    # 1. 标记实体为"待解决冲突"状态
    # 2. 记录冲突日志（含双方数据快照）
    # 3. 不覆盖本地数据，等用户手动选择
    provider.mark_conflict(incoming, local)
```

### 冲突实体标记

实体增加字段标识冲突状态：

```typescript
Interface ISyncEntity {
    GetPrimaryKey(): String;
    GetSeq(): Long;           // 实体版本号
    GetEntityType(): String;
    GetConflictState(): Enum;   // NONE | CONFLICT_PENDING
    GetConflictData(): Object;   // 冲突的对端数据快照
}
```

**冲突状态**：
- `NONE`：正常数据
- `CONFLICT_PENDING`：存在冲突，需要手动解决

**冲突数据结构**：
```json
{
  "entityId": "bk-1",
  "conflictState": "CONFLICT_PENDING",
  "localVersion": {"title": "A", "seq": 1, ...},
  "remoteVersion": {"title": "B", "seq": 5, ...},
  "conflictTime": 1713340120000
}
```

### 用户解决冲突

用户查看冲突列表，手动选择保留哪个版本：

```
用户操作：
1. 查看所有 CONFLICT_PENDING 的实体
2. 选择"保留本地"或"使用对端"
3. 确认后，实体恢复正常状态，冲突数据清除
```

**注意**：
- 冲突实体在解决前不会被同步给其他节点（避免污染）
- 冲突日志独立存储，不影响正常增量同步流程
- 手动解决后，生成新的 UPDATE 日志，记录解决时间点

### 冲突实体的同步规则

**冲突实体在未解决前，传播的是"冲突前的原始版本"，不是冲突状态版本。**

```
场景：
  Node A 本地实体：{id: "bk-1", title: "A", seq: 1}  ← 原始版本
  Node B 推送：   {id: "bk-1", title: "B", seq: 5}  ← 冲突版本

Node A 处理：
  1. 检测到冲突，标记为 CONFLICT_PENDING
  2. 存储：localVersion=原始版(A), remoteVersion=冲突版(B)
  3. 本地实体状态保持为"冲突前的原始版(A)"
  4. 对端 conflictData 记录冲突版(B)

其他节点拉取（cursor > 1）：
  → 返回的是"冲突前的原始版(A)"
  → 不是冲突状态版本，也不是冲突版(B)
  → 避免冲突扩散到更多节点

冲突解决后（用户选择"使用对端"）：
  → 本地实体更新为(B)
  → 生成新的 UPDATE 日志（seq=new）
  → 之后同步正常传播(B)版本
```

**核心原则**：
- 冲突未解决前，传播的是原始版本（冲突发生前的状态）
- 冲突解决后，生成新的日志，之后正常同步解决后的版本

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
| 游标依据 | logTimestamp（时间戳） | seq（本地序列号） |
| 时钟依赖 | 需要 NTP 同步 | 不需要，各节点独立 |
| 数据格式 | 快照 + 日志混合 | 统一为日志 |
| 初始化 | 需要生成快照文件 | 生成 BatchLog，无需额外文件 |
| 首次同步 | 快照 + 日志合并 | 直接返回 BatchLog |
| 复杂度 | 高 | 低 |

---

## 实现要点

1. **Provider 内部处理初始化逻辑**：检测到没有日志时，自动触发批量生成
2. **统一日志格式**：BatchLog 只是多个实体的包装，本质还是日志
3. **序列号推进**：首次同步后游标为 max(seq)，后续正常增量同步
4. **压缩时机**：作为后台任务，定期清理和压缩历史日志
5. **各节点维护自己的序列号**：不需要时钟同步

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