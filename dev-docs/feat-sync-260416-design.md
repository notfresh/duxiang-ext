这是一套超越具体语言（如 Java/C++）的伪代码设计，旨在体现**通用性、解耦和可扩展性**。

我们将这套系统命名为 **`UniversalSyncEngine`**。它完全基于接口编程，业务方只需要实现几个简单的适配器，即可接入同步网络。

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
框架不直接读业务表，而是读这张“流水账”。

```typescript
// 定义同步日志条目的结构
Interface ISyncLog {
    Function GetLogId(): String;       // 日志ID (数据库自增或UUID)
    Function GetEntityId(): String;    // 关联的实体ID
    Function GetOperation(): Enum;     // 操作类型: CREATE, UPDATE, DELETE
    Function GetTimestamp(): Long;     // 发生时间
    Function MarkAsSynced(): Void;     // 标记该日志已处理（更新数据库状态位）
}
```

#### 3. 数据提供者契约
这是**最关键**的接口。业务方实现它，告诉框架如何存取数据。

```typescript
// 泛型接口：T 代表具体的业务实体（如 Order）
Interface ISyncProvider<T extends ISyncEntity> {
    
    // [核心] 获取增量日志
    // 框架问：从 lastCursor 之后，有哪些数据变了？
    Function GetChangedLogs(lastCursor: Long): List<ISyncLog>;

    // [核心] 获取实体详情
    // 框架问：日志里只有 ID，请把完整的数据对象查出来给我（用于打包发送）
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

#### 2. 同步引擎
包含发送端和接收端的通用逻辑。


```typescript
Class SyncEngine {
    Private SyncRegistry registry;

    // ==========================================
    // 场景 A：发送端 - 推送模式
    // 客户端主动把本地变更推给服务端
    // ==========================================
    Function PushChanges(entityType: String, List<ISyncLog> localLogs): List<String> {
        Provider = registry.GetProvider(entityType);
        List<String> ackIds = New List();

        For Each log In localLogs {
            // 1. 根据日志类型决定操作
            If log.GetOperation() == DELETE {
                Provider.Delete(log.GetEntityId());
            } Else {
                // 2. 获取完整数据并 Upsert
                entity = Provider.GetEntityById(log.GetEntityId());
                Provider.Upsert(entity);
            }
            
            // 3. 记录成功处理的日志ID，返回给客户端
            ackIds.Add(log.GetLogId());
        }
        
        Return ackIds;
    }

    // ==========================================
    // 场景 B：发送端 - 拉取模式 (服务端视角)
    // 服务端准备数据，等待客户端来拉
    // ==========================================
    Function PreparePullData(entityType: String, Long lastCursor): SyncPackage {
        Provider = registry.GetProvider(entityType);
        SyncPackage package = New SyncPackage();

        // 1. 查日志
        List<ISyncLog> logs = Provider.GetChangedLogs(lastCursor);

        // 2. 组装数据
        For Each log In logs {
            Item = New SyncItem();
            Item.Operation = log.GetOperation();
            Item.EntityId = log.GetEntityId();
            
            // 如果是删除，不需要查详情，节省流量
            If log.GetOperation() != DELETE {
                Item.Data = Provider.GetEntityById(log.GetEntityId());
            }
            
            package.Add(Item);
        }

        // 3. 更新游标（假设日志是有序的）
        If logs.Count() > 0 {
            package.NextCursor = logs.Last().GetTimestamp();
        } Else {
            package.NextCursor = lastCursor;
        }

        Return package;
    }
}


// 这是一个辅助接口，业务方可以实现它来管理游标
Interface ISyncCursorManager {
    Function GetPullCursor(entityType: String): Long;
    Function SavePullCursor(entityType: String, timestamp: Long): Void;

    Function GetPushCursor(entityType: String): Long;
    Function SavePushCursor(entityType: String, timestamp: Long): Void;
}

// 框架核心类稍微改造一下
Class SyncEngine {
    // 注入游标管理器（可选，如果不注入，业务方就在调用接口前自己管理）
    Private ISyncCursorManager cursorManager;

    // 拉取逻辑
    Function Pull(entityType: String) {
        // 1. 从管理器获取上次拉取时间
        cursor = cursorManager.GetPullCursor(entityType);
        
        // 2. 查数据...
        data = Provider.GetChangedLogs(cursor);
        
        // 3. 应用数据...
        
        // 4. 更新管理器（注意：这里假设拉取总是成功的，或者需要更复杂的确认逻辑）
        cursorManager.SavePullCursor(entityType, data.MaxTimestamp);
    }

    // 推送逻辑
    Function Push(entityType: String) {
        // 1. 从管理器获取上次推送时间
        cursor = cursorManager.GetPushCursor(entityType);
        
        // 2. 查本地变更日志...
        logs = Provider.GetChangedLogs(cursor);
        
        // 3. 发送网络请求...
        response = HttpClient.Post("/sync/push", logs);
        
        // 4. 【关键】只有网络请求成功，才更新游标
        If response.IsSuccess {
            cursorManager.SavePushCursor(entityType, response.ServerAckTimestamp);
        }
    }
}
```
---

### 🌐 第三部分：接口层（Web Server）

这是系统与外部交互的入口，非常轻薄，只负责参数转换。

```typescript
Class SyncController {
    Private SyncEngine engine = New SyncEngine();

    // 接口 1: 客户端拉取数据
    @PostMapping("/sync/pull")
    Response Pull(Request req) {
        // 1. 解析参数
        type = req.Get("entityType"); // "ORDER"
        cursor = req.Get("lastCursor"); // 123456

        // 2. 调用引擎
        package = engine.PreparePullData(type, cursor);

        // 3. 返回 JSON
        Return JSON(package);
    }

    // 接口 2: 客户端推送数据
    @PostMapping("/sync/push")
    Response Push(Request req) {
        // 1. 解析参数
        type = req.Get("entityType");
        logs = req.GetBodyAsLogs(); // 客户端传来的变更日志列表

        // 2. 调用引擎处理，并获取确认列表
        ackList = engine.PushChanges(type, logs);

        // 3. 返回确认
        Return JSON({ "status": "ok", "ackedIds": ackList });
    }
}
```

---

### 📝 第四部分：业务落地示例

这是业务开发人员写的代码，非常简洁，完全符合“实现接口即可”的思路。

```typescript
// 1. 定义订单实体
Class Order implements ISyncEntity {
    String orderId;
    Long updateTime;
    // ... 其他字段

    Function GetPrimaryKey() { Return this.orderId; }
    Function GetVersion() { Return this.updateTime; }
    Function GetEntityType() { Return "ORDER"; }
}

// 2. 实现订单的同步提供者
Class OrderProvider implements ISyncProvider<Order> {
    
    // 实现查日志： select * from sync_log where type='ORDER' and time > ?
    Function GetChangedLogs(cursor) { 
        Return Database.QueryLogs("ORDER", cursor); 
    }

    // 实现查详情： select * from orders where id = ?
    Function GetEntityById(id) { 
        Return Database.QueryOrder(id); 
    }

    // 实现 Upsert： insert into ... on duplicate key update ...
    Function Upsert(order) { 
        Database.SaveOrder(order); 
    }

    // 实现删除： delete from orders where id = ?
    Function Delete(id) { 
        Database.DeleteOrder(id); 
    }
}

// 3. 启动配置
Function Main() {
    Registry = New SyncRegistry();
    // 一行代码接入订单同步
    Registry.Register("ORDER", New OrderProvider());
    
    // 启动 Server...
}
```

### 📌 核心逻辑总结

1.  **解耦**：`SyncEngine` 不知道什么是“订单”，它只知道 `ISyncProvider`。
2.  **日志驱动**：所有同步的源头都是 `GetChangedLogs`，这解决了“增量”和“删除”的难题。
3.  **推拉分离**：
    - **推**：接收端把本地日志发过来，引擎负责“翻译”成 Upsert/Delete 操作。
    - **拉**：引擎负责把日志“翻译”成 JSON 数据包。
4.  **通用性**：如果你想同步“用户”，只需要写一个 `UserProvider` 并注册，无需修改引擎的一行代码。