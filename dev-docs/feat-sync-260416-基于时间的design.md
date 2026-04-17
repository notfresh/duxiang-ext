#  同步的核心层
这是一套超越具体语言（如 Java/C++）的伪代码设计，旨在体现**通用性、解耦和可扩展性**。

我们将这套系统命名为 **`UniversalSyncEngine`**。它完全基于接口编程，业务方只需要实现几个简单的适配器，即可接入同步网络。

几个关键词：P2P，基于时间的增量同步算法，pull / push 独立演化。

---

### 🏗️ 第一部分：核心契约（接口定义）

这部分定义了“通用”的标准。无论你的业务实体是订单、用户还是库存，只要实现了这些接口，就能被引擎驱动。

#### 1. 实体契约
任何需要同步的数据对象，必须实现此接口。

```typescript
// 定义同步实体的基本行为
Interface ISyncEntity {
    // 获取全局唯一主键 (例如: "ORDER_1001")
    Function GetPrimaryKey(): String;

    // 获取数据版本号或更新时间戳 (用于判断新旧)
    Function GetVersion(): Long;

    // 获取实体类型标识 (例如: "ORDER", "USER")
    Function GetEntityType(): String;
}
```

#### 2. 日志契约
框架不直接读业务表，而是读这张"流水账"。日志在写入时就携带实体的完整快照，类似 git commit，记录的是操作瞬间的状态，而非当前状态。

```
Interface ISyncLog {
    Function GetLogId():     String;      // 日志唯一ID（UUID，无序，仅用于标识）
    Function GetEntityId():  String;      // 关联的实体ID
    Function GetOperation(): Enum;        // 操作类型: CREATE | UPDATE | DELETE
    Function GetTimestamp(): Long;        // 日志写入时间戳（毫秒），游标的唯一依据
    Function GetPayload():   ISyncEntity; // 操作瞬间的实体完整快照，DELETE 时为 null
}

// 【本地日志示例 - 书签场景】
// log_id    | entity_id | operation | log_timestamp | payload
// "log-a1"  | "bk-7f3a" | CREATE    | 1713340000100 | {url:"https://...", title:"示例",  updatedAt:1713340000100}
// "log-a2"  | "bk-7f3a" | UPDATE    | 1713340005000 | {url:"https://...", title:"新标题", updatedAt:1713340005000}
// "log-a3"  | "bk-7f3a" | DELETE    | 1713340010000 | null
//
// 关键设计：
// - log_timestamp 是游标依据，单调递增，与 entity.updatedAt 是两件独立的事
// - payload 写日志时就快照，发送侧直接读取，无需再查实体表
// - ISyncLog 是本地存储抽象；网络传输使用 SyncLogDTO，不直接暴露日志接口本身
// - DELETE 只需 entityId，payload 为 null（实体已删，日志仍在，对端才能知道要删）
```

#### 3. 数据提供者契约
这是**最关键**的接口。业务方实现它，告诉框架如何存取数据。

```typescript
// 泛型接口：T 代表具体的业务实体（如 Order）
Interface ISyncProvider<T extends ISyncEntity> {
    
    // [核心] 获取增量日志
    // 框架问：从 lastCursor 之后，有哪些数据变了？
    Function GetChangedLogs(lastCursor: Long): List<ISyncLog>;

    // [接收侧] 查询本地实体，仅用于冲突判断（比较版本号）
    // 发送侧直接读取 ISyncLog.GetPayload()，无需调用此方法
    Function GetEntityById(entityId: String): T;

    // [核心] 执行 Upsert (接收端用)
    // 框架命令：收到数据了，请执行“存在即更新，不存在即插入”
    Function Upsert(entity: T): Void;

    // [核心] 执行删除 (接收端用)
    // 框架命令：收到删除指令，请删除该 ID
    Function Delete(entityId: String): Void;
}
```

---

### ⚙️ 第二部分：引擎核心（通用逻辑）

这部分是框架的“大脑”，它不关心具体业务，只负责流程控制。

#### 1. 注册中心
```typescript
Class SyncRegistry {
    // 存储映射关系： "ORDER" -> OrderProvider
    Private Map<String, ISyncProvider> providers = New Map();

    // 注册业务提供者
    Function Register(entityType: String, provider: ISyncProvider): Void {
        If providers.ContainsKey(entityType) {
            Throw Error("类型已存在");
        }
        providers.Put(entityType, provider);
        Log("✅ 注册同步器: " + entityType);
    }

    // 获取提供者
    Function GetProvider(entityType: String): ISyncProvider {
        Return providers.Get(entityType);
    }
}
```

#### 2. P2P 节点身份说明

每个节点同时具备两种身份，两种身份的逻辑完全独立、不交叉：

```
节点 A                                         节点 B
  │                                               │
  │── [A 作 Client] pull(B) ──────────────►      │  [B 作 Server] handlePull()  响应，返回 B 的增量日志
  │── [A 作 Client] push(B) ──────────────►      │  [B 作 Server] handlePush() 响应，接收并写入 A 的变更
  │                                               │
  │  [A 作 Server] handlePull()  ◄────────────   │  [B 作 Client] pull(A)
  │  [A 作 Server] handlePush() ◄────────────    │  [B 作 Client] push(A)
```

| 身份 | 动作 | 是否持有游标 | 游标存储位置 |
|------|------|-------------|-------------|
| **Client（主动方）** | 自主发起 pull / push | ✅ 是 | 本节点本地存储 |
| **Server（被动方）** | 响应对端请求 | ❌ 否，无状态 | — |

> **核心原则**：游标完全由 Client（本节点）自己管理。Server 是纯函数式的，给定输入，返回输出，不记录任何同步状态。

---

#### 3. 游标管理契约

游标语义：**"我上次与 peerId 成功同步，处理到的最新日志时间戳"**，按 `peerId × entityType` 两个维度隔离，各 peer 独立推进，互不影响。

```
Interface ISyncCursorManager {

    // Pull 游标：我上次从 peerId 成功拉取到的 log_timestamp
    // 语义：比此时间戳更新的日志，我还未从对端获取
    Function GetPullCursor(peerId: String, entityType: String): Long;
    Function SavePullCursor(peerId: String, entityType: String, timestamp: Long): Void;

    // Push 游标：我上次成功推给 peerId 的 log_timestamp
    // 语义：比此时间戳更新的本地日志，我还未推送给对端
    Function GetPushCursor(peerId: String, entityType: String): Long;
    Function SavePushCursor(peerId: String, entityType: String, timestamp: Long): Void;
}

// 游标更新时机（关键安全约束）：
// - Pull 游标：数据成功写入本地之后才更新，失败则不前进
// - Push 游标：对端成功 ack 之后才更新，失败则不前进
// 两者均保证 at-least-once；Upsert 的幂等性保证重复推送无害
```

---

#### 4. 数据传输对象

```
// Pull 响应包：Server 返回给 Client 的增量数据
Record SyncPullResponse {
    List<SyncLogDTO> items;     // 增量数据列表（按 logTimestamp 升序）
    Long             nextCursor; // 本批 DTO 中最大的 logTimestamp，Client 用于更新 Pull 游标
}

// Push 响应体：Server 返回给 Client 的处理结果
Record SyncPushResponse {
    Boolean      success;
    Long         serverAckTimestamp; // 本次成功处理的最大 logTimestamp，仅在 success=true 时用于推进 Push 游标
    List<String> ackedEntityIds;     // 已成功处理的 entityId 列表（诊断用途）
}

// 单条传输日志（wire schema，不直接暴露本地 ISyncLog 接口）
Record SyncLogDTO {
    Long        logTimestamp; // 直接映射自 ISyncLog.GetTimestamp()，是游标推进的唯一依据
    String      entityId;
    Operation   operation;    // CREATE | UPDATE | DELETE
    ISyncEntity payload;      // 直接映射自 ISyncLog.GetPayload()，DELETE 时为 null
}
```

---

#### 5. Client 侧逻辑：SyncClient

**职责**：主动发起 pull 和 push，管理游标，是唯一持有同步状态的一方。

`pull` 和 `push` 是**独立的一等公民方法**，可单独调用，各自语义完整，类似 `git pull` / `git push`。

```
Class SyncClient {
    Private SyncRegistry       registry;
    Private ISyncCursorManager cursorManager;
    Private INetworkTransport  transport;

    // ══════════════════════════════════════════════════════
    // pull(peerId, entityType)
    // 语义：我主动去拉取 peerId 上比我更新的数据
    // 触发时机：启动时、定时兜底、收到对端"有新数据"通知时
    // ══════════════════════════════════════════════════════
    Function pull(peerId: String, entityType: String): Void {
        Provider = registry.GetProvider(entityType);

        // 1. 读游标：我上次从这个 peer 成功拉到的时间点
        cursor = cursorManager.GetPullCursor(peerId, entityType);

        // 2. 向对端 Server 请求增量数据
        response = transport.get(peerId, "/sync/pull", {
            entityType: entityType,
            lastCursor: cursor
        });

        If NOT response.success {
            Log("pull failed from " + peerId);
            Return; // 不更新游标，下次从同一游标重试
        }

        package = response.data; // SyncPullResponse

        // 3. 按 logTimestamp 升序应用数据（幂等）
        //    收到的是传输 DTO，不是对端的本地 ISyncLog 接口
        For Each item In package.items {
            If item.operation == DELETE {
                Provider.Delete(item.entityId);
            } Else {
                // 冲突解决：LWW（Last-Write-Wins by entity.updatedAt）
                // GetEntityById 仅在此处使用，目的是读取本地版本做比较
                local = Provider.GetEntityById(item.entityId);
                If local == null OR local.GetVersion() < item.payload.GetVersion() {
                    Provider.Upsert(item.payload);
                }
                // else: 本地版本更新，丢弃对端旧数据
            }
        }

        // 4. 数据写入本地成功后，才推进游标
        If package.nextCursor > cursor {
            cursorManager.SavePullCursor(peerId, entityType, package.nextCursor);
        }
    }

    // ══════════════════════════════════════════════════════
    // push(peerId, entityType)
    // 语义：我把本地新变更主动推给 peerId
    // 触发时机：本地数据发生变更时（实时）、重试队列消费时
    // ══════════════════════════════════════════════════════
    Function push(peerId: String, entityType: String): Void {
        Provider = registry.GetProvider(entityType);

        // 1. 读游标：我上次成功推给这个 peer 的时间点
        cursor = cursorManager.GetPushCursor(peerId, entityType);

        // 2. 查本地在游标之后产生的变更日志
        //    SQL: SELECT * FROM sync_log WHERE log_timestamp > cursor ORDER BY log_timestamp ASC
        logs = Provider.GetChangedLogs(cursor);

        If logs.isEmpty() {
            Return; // 没有新变更，不发请求
        }

        // 3. 组装 SyncLogDTO：从本地 ISyncLog 提取网络层所需字段
        items = New List<SyncLogDTO>();
        For Each log In logs {
            item = New SyncLogDTO();
            item.logTimestamp = log.GetTimestamp();
            item.entityId     = log.GetEntityId();
            item.operation    = log.GetOperation();
            item.payload      = log.GetPayload(); // CREATE/UPDATE 时为实体快照，DELETE 时为 null
            items.Add(item);
        }

        // 4. 推送给对端
        response = transport.post(peerId, "/sync/push", {
            entityType: entityType,
            items:      items
        });

        // 5. 只有对端 success=true 时，才按 serverAckTimestamp 推进游标
        If response.success {
            cursorManager.SavePushCursor(peerId, entityType, response.serverAckTimestamp);
        } Else {
            Log("push failed to " + peerId + ", will retry from cursor: " + cursor);
        }
    }

    // ══════════════════════════════════════════════════════
    // syncWithPeer(peerId, entityType)
    // 【显式组合方法】= pull + push 的便捷包装
    // 这不是原子操作，调用方可按需拆开单独使用 pull 或 push
    // 默认顺序：先 pull（获取对端最新状态）再 push（推送本地变更）
    // ══════════════════════════════════════════════════════
    Function syncWithPeer(peerId: String, entityType: String): Void {
        pull(peerId, entityType);
        push(peerId, entityType);
    }
}
```

> **设计说明**：
> - `pull` 和 `push` 独立演化，各自有完整的游标和重试语义。
> - `syncWithPeer` 仅是组合，先 pull 后 push 可减少"用旧数据覆盖对端新数据"的概率，但只是推荐顺序，非强制。
> - 冲突解决（LWW）在接收侧统一执行，无论是 `pull` 还是 `handlePush` 收到数据，逻辑完全对称。
> - `logTimestamp` 只用于游标推进；`entity.updatedAt` 只用于版本冲突判断，二者不能混用。

---

#### 6. Server 侧逻辑：SyncServer

**职责**：被动响应对端请求，完全无状态（Stateless）。给定输入，返回输出，不记录任何同步进度。

```
Class SyncServer {
    Private SyncRegistry registry;

    // ══════════════════════════════════════════════════════
    // handlePull(entityType, lastCursor)
    // 对端来拉数据：查本地日志，组装传输 DTO 返回
    // ══════════════════════════════════════════════════════
    Function handlePull(entityType: String, lastCursor: Long): SyncPullResponse {
        Provider = registry.GetProvider(entityType);

        // 1. 查本地在 lastCursor 之后的变更日志（按 log_timestamp 升序）
        //    SQL: SELECT * FROM sync_log WHERE log_timestamp > lastCursor ORDER BY log_timestamp ASC
        logs = Provider.GetChangedLogs(lastCursor);

        // 2. 直接从本地日志组装传输 DTO，不暴露 ISyncLog 接口本身
        package = New SyncPullResponse();
        For Each log In logs {
            item = New SyncLogDTO();
            item.logTimestamp = log.GetTimestamp();
            item.entityId     = log.GetEntityId();
            item.operation    = log.GetOperation();
            item.payload      = log.GetPayload(); // DELETE 时为 null
            package.items.Add(item);
        }

        // 3. 设置游标（取本批 DTO 中最大的 logTimestamp）
        If NOT package.items.isEmpty() {
            package.nextCursor = package.items.Last().logTimestamp;
        } Else {
            package.nextCursor = lastCursor; // 无新数据，游标不动
        }

        Return package;
        // Server 不记录任何状态，不知道"谁拉了多少"
    }

    // ══════════════════════════════════════════════════════
    // handlePush(entityType, items)
    // 对端把数据推过来：接收并写入本地，返回 ack
    // ══════════════════════════════════════════════════════
    Function handlePush(entityType: String, items: List<SyncLogDTO>): SyncPushResponse {
        Provider = registry.GetProvider(entityType);
        maxTimestamp = 0;
        ackedIds = New List<String>();

        For Each item In items {
            Try {
                If item.operation == DELETE {
                    Provider.Delete(item.entityId);
                } Else {
                    // 冲突解决：LWW，与 SyncClient.pull 中逻辑完全对称
                    local = Provider.GetEntityById(item.entityId);
                    If local == null OR local.GetVersion() < item.payload.GetVersion() {
                        Provider.Upsert(item.payload);
                    }
                }

                ackedIds.Add(item.entityId);
                If item.logTimestamp > maxTimestamp {
                    maxTimestamp = item.logTimestamp;
                }
            } Catch error {
                Log("Failed to apply item: " + item.entityId + " error: " + error);
                // 失败立即返回；Client 不推进游标，下次从同一 cursor 重试整批数据
                Return SyncPushResponse {
                    success:            false,
                    serverAckTimestamp: maxTimestamp,
                    ackedEntityIds:     ackedIds
                };
            }
        }

        Return SyncPushResponse {
            success:            true,
            serverAckTimestamp: maxTimestamp,
            ackedEntityIds:     ackedIds
        };
        // Server 不记录游标，无状态
    }
}
```

> **设计说明**：
> - Server 是纯函数式的，可以水平扩展，任意实例都能响应请求。
> - `handlePull` 读取本地 `ISyncLog`，但对外返回 `SyncLogDTO`，不直接暴露存储接口。
> - `handlePush` 的冲突解决逻辑与 `SyncClient.pull` 完全对称，接收方统一做 LWW 判断。
> - Push 失败时 Client 不推进游标，从同一 cursor 重放整批数据，依赖 Upsert/Delete 幂等性保证安全。

---

#### 7. 编排层：SyncEngine

**职责**：将 Client 和 Server 组装起来，维护 `knownPeers` 列表，并通过 `SyncEngineOptions` 编排两种角色是否启用。默认启用 client，server 按需开启。

```
Record SyncEngineOptions {
    Boolean clientEnabled = true;   // 默认开启主动同步能力
    Boolean serverEnabled = false;  // 默认关闭被动服务能力，按需开启
}

Class SyncEngine {
    Private SyncEngineOptions options;
    Private SyncClient client;
    Private SyncServer server;
    Private List<String> knownPeers = New List();

    // 约定：当某个功能未启用时，对应依赖传 null
    Constructor(options: SyncEngineOptions, client, server) {
        this.options = options;
        this.client  = client;
        this.server  = server;
    }

    Function IsClientEnabled(): Boolean {
        Return options.clientEnabled;
    }

    Function IsServerEnabled(): Boolean {
        Return options.serverEnabled;
    }

    // ── Peer 列表维护（编排层负责）──────────────────────
    Function RegisterPeer(peerId: String): Void {
        If NOT knownPeers.Contains(peerId) {
            knownPeers.Add(peerId);
        }
    }

    Function UnregisterPeer(peerId: String): Void {
        knownPeers.Remove(peerId);
    }

    Function GetKnownPeers(): List<String> {
        Return knownPeers;
    }

    // ── Server 侧入口（供网络路由层调用）──────────────────
    Function onPullRequest(entityType: String, cursor: Long): SyncPullResponse {
        If NOT options.serverEnabled {
            Throw Error("Server feature is disabled");
        }
        Return server.handlePull(entityType, cursor);
    }

    Function onPushRequest(entityType: String, items: List<SyncLogDTO>): SyncPushResponse {
        If NOT options.serverEnabled {
            Throw Error("Server feature is disabled");
        }
        Return server.handlePush(entityType, items);
    }

    // ── Client 侧入口（供业务层/定时器调用）───────────────
    // 单独 pull：按需拉取某个 peer 的增量数据
    Function pull(peerId: String, entityType: String): Void {
        If NOT options.clientEnabled {
            Log("Client feature is disabled");
            Return;
        }
        client.pull(peerId, entityType);
    }

    // 单独 push：按需将本地变更推送给某个 peer
    Function push(peerId: String, entityType: String): Void {
        If NOT options.clientEnabled {
            Log("Client feature is disabled");
            Return;
        }
        client.push(peerId, entityType);
    }

    // 按当前已知 peer 列表执行一轮 pull
    Function pullAll(entityType: String): Void {
        If NOT options.clientEnabled {
            Log("Client feature is disabled");
            Return;
        }
        For Each peerId In knownPeers {
            client.pull(peerId, entityType);
        }
    }

    // 组合同步：pull + push 的显式便捷包装
    Function syncWithPeer(peerId: String, entityType: String): Void {
        If NOT options.clientEnabled {
            Log("Client feature is disabled");
            Return;
        }
        client.syncWithPeer(peerId, entityType);
    }
}
```

---

### 🌐 第三部分：网络层（Transport）

网络层负责将 Client 的逻辑请求转换为实际网络调用，将收到的请求路由到 Server Handler。

```
// Client 侧网络抽象接口
Interface INetworkTransport {
    Function get(peerId: String, path: String, params: Object): NetworkResponse;
    Function post(peerId: String, path: String, body: Object): NetworkResponse;
}

// HTTP 实现示例（业务方提供）
Class HttpTransport implements INetworkTransport {
    Function get(peerId, path, params) {
        url = "http://" + peerId + path;
        Return HttpClient.Get(url, queryParams: params);
    }
    Function post(peerId, path, body) {
        url = "http://" + peerId + path;
        Return HttpClient.Post(url, body: body);
    }
}

// Server 侧 HTTP 路由
// 仅当 engine.IsServerEnabled() = true 时才创建并挂载本 Router
Class SyncHttpRouter {
    Private SyncEngine engine;

    // 对端来拉我的数据
    @GET("/sync/pull")
    Response routePull(Request req) {
        entityType = req.Query("entityType");
        cursor     = req.Query("lastCursor");
        package    = engine.onPullRequest(entityType, Long(cursor));
        Return JSON({ success: true, data: package });
    }

    // 对端把数据推给我
    @POST("/sync/push")
    Response routePush(Request req) {
        entityType = req.Body("entityType");
        items      = req.Body("items"); // List<SyncLogDTO>
        result     = engine.onPushRequest(entityType, items);
        Return JSON(result);
    }
}
```

---

### 📝 第四部分：业务落地示例

业务方只需实现 `ISyncProvider`，框架自动驱动同步。

```
// 1. 定义实体（实现 ISyncEntity）
Record Bookmark implements ISyncEntity {
    String bookmarkId;
    String url;
    String title;
    Long   updatedAt;  // 实体级版本号，用于冲突解决（LWW）

    Function GetPrimaryKey(): String { Return this.bookmarkId; }
    Function GetVersion():    Long   { Return this.updatedAt; }
    Function GetEntityType(): String { Return "BOOKMARK"; }
}

// 2. 实现数据提供者（实现 ISyncProvider）
Class BookmarkProvider implements ISyncProvider<Bookmark> {

    // 查增量日志（含 payload 快照）
    // SQL: SELECT * FROM sync_log WHERE entity_type='BOOKMARK' AND log_timestamp > cursor
    //      ORDER BY log_timestamp ASC
    Function GetChangedLogs(cursor: Long): List<ISyncLog> {
        Return LocalDB.QueryLogs("BOOKMARK", cursor);
    }

    // 查本地实体，仅供接收侧冲突判断使用
    // SQL: SELECT * FROM bookmarks WHERE id = ?
    Function GetEntityById(id: String): Bookmark {
        Return LocalDB.QueryBookmark(id);
    }

    // 幂等写入
    // SQL: INSERT OR REPLACE INTO bookmarks ...
    Function Upsert(entity: Bookmark): Void {
        LocalDB.SaveBookmark(entity);
    }

    // 删除
    // SQL: DELETE FROM bookmarks WHERE id = ?
    Function Delete(id: String): Void {
        LocalDB.DeleteBookmark(id);
    }
}

// 3. 本地写操作时同步写日志（业务层负责）
Function onBookmarkCreate(bookmark: Bookmark): Void {
    LocalDB.SaveBookmark(bookmark);
    LocalDB.AppendLog({
        entityId:  bookmark.bookmarkId,
        operation: CREATE,
        timestamp: Now(),
        payload:   bookmark  // 快照写入日志
    });
}

Function onBookmarkUpdate(bookmark: Bookmark): Void {
    LocalDB.SaveBookmark(bookmark);
    LocalDB.AppendLog({
        entityId:  bookmark.bookmarkId,
        operation: UPDATE,
        timestamp: Now(),
        payload:   bookmark  // 快照写入日志
    });
}

Function onBookmarkDelete(bookmarkId: String): Void {
    LocalDB.DeleteBookmark(bookmarkId);
    LocalDB.AppendLog({
        entityId:  bookmarkId,
        operation: DELETE,
        timestamp: Now(),
        payload:   null  // DELETE 不需要 payload
    });
}

// 4. 启动配置
Function Bootstrap() {
    registry      = New SyncRegistry();
    cursorManager = New LocalCursorManager(); // 业务方实现，持久化到本地
    transport     = New HttpTransport();

    registry.Register("BOOKMARK", New BookmarkProvider());

    options = SyncEngineOptions {
        clientEnabled: true,   // 默认开启
        serverEnabled: false   // 按需开启
    };

    client = null;
    If options.clientEnabled {
        client = New SyncClient(registry, cursorManager, transport);
    }

    server = null;
    If options.serverEnabled {
        server = New SyncServer(registry);
    }

    engine = New SyncEngine(options, client, server);
    engine.RegisterPeer("peer-a");
    engine.RegisterPeer("peer-b");

    // 仅当 serverEnabled=true 时，才暴露 /sync/* 路由
    If engine.IsServerEnabled() {
        router = New SyncHttpRouter(engine);
        HttpServer.Mount(router);
    }

    // 仅当 clientEnabled=true 时，才执行主动同步
    If engine.IsClientEnabled() {
        Every 30_000ms {
            engine.pullAll("BOOKMARK");
        }

        OnLocalChange(entityType, peerId) {
            engine.push(peerId, entityType);
        }
    }
}
```

---

### 📌 核心逻辑总结

#### 架构层次

```
业务层    BookmarkProvider（只需实现 4 个方法）+ 写操作时追加日志
           ↓
框架层    SyncClient（主动方）          SyncServer（被动方）
          pull / push / syncWithPeer    handlePull / handlePush
          [持有游标，自治演化]           [无状态，纯函数式]
           ↓                             ↓
编排层    SyncEngine（组合 Client + Server，维护 knownPeers，编排角色开关，暴露统一入口）
           ↓
网络层    INetworkTransport / SyncHttpRouter（仅 serverEnabled=true 时挂载）
           ↓
契约层    ISyncEntity / ISyncLog / ISyncProvider / SyncLogDTO / ISyncCursorManager
```

#### 九个关键设计决策

1. **日志即快照**：`ISyncLog` 在写入时就携带实体完整快照（`GetPayload()`），发送侧直接读取，无需再查实体表。DELETE 时 payload 为 null，但日志本身必须保留，实体删了日志还在，对端才能知道"这个 ID 被删了"。

2. **分层清晰**：`ISyncLog` 是本地存储抽象，`SyncLogDTO` 是网络传输对象。两者字段可以一一映射，但不直接把存储接口暴露到 wire schema。

3. **游标 = log_timestamp**：游标依据是 `sync_log` 的写入时间戳，不是 entity_id，也不是 `entity.updatedAt`。`logTimestamp` 用于同步进度推进，`updatedAt` 只用于 LWW 冲突解决。

4. **Client 持有游标，Server 无状态**：每个节点以 Client 身份管理自己对每个 peer 的同步进度（`pullCursor[peerId][entityType]`，`pushCursor[peerId][entityType]`）。Server 不记录任何状态，可水平扩展。

5. **编排层维护 peer 列表**：`SyncEngine` 直接维护 `knownPeers`，并提供 `RegisterPeer` / `UnregisterPeer` / `GetKnownPeers` / `pullAll` 这类跨 peer 编排能力。peer 列表属于编排层状态，不属于 Client 或 Server。

6. **角色按需启用**：`SyncEngineOptions` 控制 client / server 是否启用。默认 `clientEnabled=true`、`serverEnabled=false`；当 server 未启用时，不创建 `SyncServer`，也不挂载 `SyncHttpRouter`。

7. **pull / push 独立演化**：两个方法是一等公民，类似 `git pull` / `git push`，各自有完整语义，可单独调用。`syncWithPeer` 是显式的组合方法，调用方清楚它只是 `pull + push` 的包装，非原子，非强制顺序。

8. **Push 失败不推进游标**：`handlePush` 遇到错误立即返回 `success=false`，Client 保持原 cursor 重试整批数据，依赖 Upsert/Delete 的幂等性实现 at-least-once。

9. **通用性**：新增实体类型只需写一个 `XxxProvider` 并注册，框架代码零修改。
