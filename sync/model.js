// SyncInterface — minimal interface expected by sync protocol.
// Defines `id()` and async `hash()` contract. Lightweight and environment-agnostic.

(function(global){
  class SyncInterface {
    // Subclasses must return a string stable global id
    id() { throw new Error('override id() in subclass') }

    // Subclasses must implement an async hash() that returns a hex sha256 string
    async hash() { throw new Error('override hash() in subclass') }

    // 以下为建议的高层抽象方法：
    // - 子类应实现这些方法以记录用户操作并生成对应的 Change / Op 对象。
    // - 注意：这些方法**仅返回对象**（Change 或 Op），不应在方法内部进行持久化存储；存储与发送由上层调用者负责。

    // 创建一个表示新增的 Change
    // data: 业务对象的内容（JSON）
    // 返回: Promise<Change>
    async createChangeAdd(data) { throw new Error('override createChangeAdd in subclass') }

    // 创建一个表示更新的 Change
    // targetId: 目标对象 id
    // data: 更新后的业务对象内容（JSON）
    // 返回: Promise<Change>
    async createChangeUpdate(targetId, data) { throw new Error('override createChangeUpdate in subclass') }

    // 创建一个表示删除的 Change
    // targetId: 目标对象 id
    // 返回: Promise<Change>
    async createChangeDelete(targetId) { throw new Error('override createChangeDelete in subclass') }

    // 把若干 Change 打包成一个 Op（不写入数据库，仅构造并返回）
    // deviceId: 发起设备 id
    // parents: 父 op id 列表
    // changes: array of Change
    // timestamp: 可选，ISO 字符串（若未提供由实现填写）
    // 返回: Promise<Op>
    async createOp(deviceId, parents, changes, timestamp) { throw new Error('override createOp in subclass') }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncInterface };
  }
  if (typeof global !== 'undefined') global.SyncInterface = SyncInterface;

})(typeof window !== 'undefined' ? window : globalThis);
