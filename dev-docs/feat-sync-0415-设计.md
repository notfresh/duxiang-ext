## 设计

设计一个多点写入的一致性协议，参考Git，但是把git中传统的文件管理 迁移为 Json对象。

名字为 “JsonGit-Lite”**协议（关键字：P2P、JSON对象、DAG、手动合并、无身份验证）

### 📦 核心数据模型：一切皆对象

管理的对象，没有“文件”和“文件夹”的概念，只有**集合**和**集合内的元素对象**。

#### 1. 数据对象
每个业务数据（如一条笔记、一个任务）都是一个标准的 JSON 对象。为了实现通用同步，它必须包含以下**保留字段**：

```json
{
  "id": "obj_note_001",        // [必填] 全局唯一 ID (主键)
  "type": "note",               // [必填] 类型标识 (用于区分业务)
  "version": 1,                 // [必填] 版本号 (每次修改 +1)
  "data": {                     // [业务数据] 实际内容
    "title": "我的设计思路",
    "content": "..."
  },
  "deleted": false              // [必填] 软删除标记 (true 代表删除)
}
```

#### 2. 提交对象
这是模仿 Git 的 Commit，但它记录的是**对象集合的快照**或**增量**。为了轻量，我们采用**“引用 + 增量”**模式。

```json
{
  "hash": "a1b2c3...",          // 自身哈希 (SHA-256)
  "parents": ["d4e5f6..."],     // 父节点哈希 (DAG 的核心，可以是1个或2个)
  "timestamp": 1678888888,      // 时间戳
  "changes": [                  // 变更集 (Delta)
    {
      "targetId": "obj_note_001",
      "action": "UPDATE",        // CREATE | UPDATE | DELETE
      "content": { ... }         // 完整的 JSON 对象 (为了简单，不传部分更新)
    }
  ]
}
```
#### 3. 创世 Hash（Genesis Hash）
DAG 的公共起点，所有设备共享同一个常量值：

```
GENESIS_HASH = '0000...0000'  // 64个0
```

- 是一个**虚节点**，不实际写入数据库
- 新安装插件时，本地 HEAD 初始化为 `GENESIS_HASH`
- `DAGManager.hasAncestor` 和 `findLCA` 遇到它直接返回，无需查表
- 握手时两端均以真实 hash 或 `GENESIS_HASH` 表示自身 HEAD，协议无需特判 null

| 本地 HEAD | 远端 HEAD | 结果 |
|---|---|---|
| GENESIS_HASH | GENESIS_HASH | 双方都是新装，无需同步 |
| GENESIS_HASH | abc123 | 本地无历史，全量拉取远端所有 commits |
| abc123 | GENESIS_HASH | 远端是新装，直接 push 即可（远端 fast-forward） |
| abc123 | def456 | 正常流程，找 LCA 算差异 |
---

说明：`HEAD` 字段永远不可为 null，使用 `GENESIS_HASH` 来表示空历史；

#### 🧱 核心接口与数据结构

这部分定义了“什么可以被同步”以及“数据长什么样”。

#### 1. `ISyncable` (接口)
**职责**：定义所有需要同步的业务对象的通用行为。任何实现了此接口的类（如 `Note`, `User`, `Task`）都能被同步引擎自动管理。

**核心方法**：
- `getId(): string`
    - **职责**：返回对象的全局唯一标识符。
- `getVersion(): number`
    - **职责**：返回当前对象的版本号（用于冲突检测）。
- `getHashInput(): string`
    - **职责**：返回用于计算哈希的标准化字符串（通常是去除了元数据的 JSON 序列化字符串）。
- `merge(remote: ISyncable): MergeResult`
    - **职责**：**核心逻辑**。对比 `this`（本地）和 `remote`（远程）的数据。
    - **返回**：
        - 若无冲突，自动合并并返回 `SUCCESS`。
        - 若有冲突，返回 `CONFLICT`，并保留双方数据供后续处理。

代码库中只需要实现一个简单的接口，任何业务对象只要实现它，就能被同步：

```typescript
interface ISyncable {
  id: string;
  version: number;
  // 序列化：用于计算哈希和传输
  toJSON(): string; 
  // 合并：核心冲突处理逻辑
  merge(other: ISyncable): ISyncable; 
}
```

// 示例：`Bookmark` 的 ISyncable 参考实现（供前端直接复用）
```javascript
function createBookmark({ id, url, title, tags = [] }) {
    return {
        id,
        type: 'Bookmark',
        version: 1,
        deleted: false,
        url,
        title,
        tags,

        getHashInput() {
            return JSON.stringify({ id: this.id, url: this.url, title: this.title, tags: this.tags });
        },

        merge(remote) {
            const conflicts = [];
            const resolved = { ...this };
            if (remote.url !== this.url) conflicts.push('url');
            if (remote.title !== this.title) conflicts.push('title');
            resolved.tags = Array.from(new Set([...(this.tags || []), ...(remote.tags || [])]));
            if (conflicts.length) return { status: 'CONFLICT', local: this, remote };
            resolved.version = Math.max(this.version || 0, remote.version || 0) + 1;
            return { status: 'SUCCESS', resolved };
        }
    };
}
```


#### 2. `Commit` (类/结构)
**职责**：对应 Git 中的 Commit 对象，是 DAG 的节点。它不存储业务数据本身，而是存储对数据的“变更操作”。

**核心字段**：
- `hash: string`：自身的 SHA-256 哈希值。
- `parents: string[]`：父节点哈希列表（1个代表普通提交，2个代表合并提交）。
- `timestamp: number`：创建时间戳。
- `authorId: string`：创建者的设备 ID。
- `changes: Change[]`：变更集列表。

#### 3. `Change` (类/结构)
**职责**：描述一次具体的修改动作。

**核心字段**：
- `targetId: string`：被修改的业务对象 ID。
- `type: string`：对象类型（如 "Note"）。
- `action: 'CREATE' | 'UPDATE' | 'DELETE'`：操作类型。
- `payload: object`：完整的 JSON 对象数据（为了轻量，直接存全量快照）。

---

#### 同步管理器
这是一个单例类，负责管理 P2P 连接和 DAG 图，它不关心数据是什么，只管 `ISyncable`。

*   `pull(peerUrl)`: 从远端拉取缺失的 commits，执行本地合并（可能触发冲突挂起）。
*   `push(peerUrl)`: 推送本地领先的 commits 到远端（充要条件：远端 HEAD 是本地 HEAD 的祖先，远端执行 fast-forward）。
*   `sync(peerUrl)`: `pull` → 等冲突解决 → `push` 的组合，常见的一键同步入口。
*   `getConflicts()`: 获取当前需要手动处理的冲突列表。
*   `resolveConflict(id, strategy)`: 用户解决冲突后调用，完成后自动触发 `push`。

---

### ⚙️ 同步引擎核心

这部分是“通用逻辑”，不关心业务，只负责搬运和校验数据。

#### 4. `SyncEngine` (类)
**职责**：同步流程的控制器，负责协调存储、网络和数据合并。

**核心字段**：
- `store: IObjectStore`：本地数据存储接口。
- `dag: DAGManager`：DAG 图管理器。
- `conflictResolver: ConflictResolver`：冲突处理管理器。

**核心方法**：
- `async connect(peerUrl: string): Promise<void>`
    - **职责**：建立与远程 Peer 的网络连接（WebSocket/TCP）。
- `async sync(peer: Peer): Promise<SyncStatus>`
    - **职责**：执行完整的同步流程（握手 -> 拉取 -> 合并 -> 推送）。
- `private async pullChanges(peer: Peer): Promise<Commit[]>`
    - **职责**：
        1. 发送本地 HEAD。
        2. 接收远程缺失的 Commit 列表。
        3. 将 Commit 存入本地临时区。
- `private async pushChanges(peer: Peer): Promise<boolean>`
    - **职责**：
        1. 执行**推送预检**（发送拟推送的 Commit，检查是否包含远程 HEAD）。
        2. 若预检通过，传输数据。
- `private async applyCommits(commits: Commit[]): Promise<void>`
    - **职责**：将拉取下来的 Commit 应用到本地数据库，并触发对象合并逻辑。

#### 5. `DAGManager` (类)
**职责**：管理提交历史图，计算哈希和祖先关系。

**核心方法**：
- `createCommit(parents: string[], changes: Change[]): Commit`
    - **职责**：构建一个新的 Commit 对象，并计算其哈希。
- `hasAncestor(commitHash: string, ancestorHash: string): boolean`
    - **职责**：**关键校验**。判断 `ancestorHash` 是否是 `commitHash` 的祖先（用于推送预检）。
- `findLCA(hashA: string, hashB: string): string`
    - **职责**：寻找两个提交的最近公共祖先，用于计算差异。

---

### 🛠️ 冲突与存储

#### 6. `ConflictResolver` (类)
**职责**：处理 `ISyncable.merge` 返回的冲突，管理“手动合并”的生命周期。

**核心字段**：
- `pendingConflicts: ConflictItem[]`：当前挂起的冲突列表。

**核心方法**：
- `addConflict(local: ISyncable, remote: ISyncable): string`
    - **职责**：记录冲突，生成一个冲突任务 ID，并暂停同步流程。
- `resolve(conflictId: string, strategy: 'LOCAL' | 'REMOTE' | 'MANUAL', data?: object): void`
    - **职责**：
        - 用户选择策略后，生成最终的对象数据。
        - 创建一个新的“合并 Commit”来固化这个结果。
        - 从 `pendingConflicts` 中移除该任务。        
        - **自动触发 `push`**，恢复同步流程的续传，无需用户再次操作。
        
#### 7. `ObjectStore` (类/接口)
**职责**：底层的 CRUD 操作，类似于 Git 的对象数据库。

**核心方法**：
- `get(id: string): ISyncable`
- `save(obj: ISyncable): void`
- `getAllIds(): string[]`
    - **职责**：用于握手阶段生成“本地已知 ID 列表”。

### 📝 同步交互流程简述（代码视角）

1. **用户修改数据** -> 调用 `store.save(note)` -> 引擎自动生成 `Commit` (Parent: 本地HEAD)。
2. **用户点击同步** -> `engine.sync(peer)`。
3. **引擎** -> `pullChanges` -> 发现远程有新数据 -> 拉取。
4. **引擎** -> `applyCommits` -> 发现 `note` 冲突 -> `conflictResolver.addConflict`。
5. **引擎** -> 暂停，返回状态 `NEEDS_MERGE`。
6. **UI层** -> 显示冲突 -> 用户手动修改 -> 调用 `resolver.resolve`。
7. **引擎** -> 生成 `Merge Commit` (Parents: [本地, 远程]) -> `pushChanges`。
8. **引擎** -> 发送 `PUSH_CHECK` -> 远程验证 `hasAncestor` -> 通过 -> 推送成功。

## 设计：存储

没错，确实得存起来。不过咱们这个场景比较特殊，因为你要模仿 Git 的核心机制，所以这个“数据库”不能只是简单地往里扔 JSON 就完事了。

普通的数据库（比如 MySQL 或 MongoDB）通常只管“最新状态”，而你的设计需要同时管理**“最新状态”**和**“历史记录（DAG）”**。

为了保持你追求的“轻量级”和“Git 特性”，我建议采用**“混合存储模式”**。具体来说，你需要存两份东西：

### 1. 为什么要存两份？

- **工作区**：你需要快速读取当前的 JSON 对象（比如打开笔记列表），不能每次都去遍历 DAG 历史反算，太慢了。
- **版本库**：你需要存储 Commit 和 DAG 结构，用于同步、冲突检测和版本回溯。