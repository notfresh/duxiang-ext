/**
 * 数据库常量 —— 单一来源。
 *
 * 为什么单独一个文件：DB_VERSION 被三处用到（storage.js / eventlog.js /
 * background.js）。以前 background.js 写的是 3、storage.js 写的是 4 ——
 * 版本号不一致时，`indexedDB.open(name, 旧版本)` 在库已经是新版本时会抛
 * VersionError，那个连接直接废掉（后台保存选中文本就是这么坏的）。
 *
 * 依赖方向：本文件不 import 任何东西 —— 是最底层的叶子。
 */

/** 数据库名。 */
export const DB_NAME = 'readingLinks';

/**
 * 数据库版本。
 *
 * 版本历史：
 *   1  初始
 *   2  settings 表
 *   3  selections 表
 *   4  deleted_hashes 表
 *   5  event_log / sync_point / entity_state 表（eventlog 同步）
 */
export const DB_VERSION = 5;

/** links 表 —— 阅读链接。 */
export const STORE_NAME = 'links';

/** groups 表 —— 分组。 */
export const GROUPS_STORE_NAME = 'groups';

/** settings 表 —— 用户设置。 */
export const SETTINGS_STORE_NAME = 'settings';

/** settings 表里存用户设置的那条记录的 key。 */
export const SETTINGS_KEY = 'userSettings';

/** selections 表 —— 页面选中文本。 */
export const SELECTIONS_STORE_NAME = 'selections';

/** event_log 表 —— 本地事件日志（eventlog 同步）。 */
export const EVENT_STORE_NAME = 'event_log';

/** sync_point 表 —— 推/拉游标 + bootstrap 标志（eventlog 同步）。 */
export const SYNC_POINT_STORE_NAME = 'sync_point';

/** entity_state 表 —— 每个实体最后应用的事件状态（字段级 LWW 用）。 */
export const ENTITY_STATE_STORE_NAME = 'entity_state';

/**
 * 所有对象存储名 —— 建库时一次性建齐。
 *
 * 为什么集中在这里：`CREATE TABLE IF NOT EXISTS` / `createObjectStore` 的
 * 幂等性只在「同一个连接里跑过完整的升级回调」时成立。storage.js 里有一条
 * 「强制重建数据库」的兜底路径，它会删库重建 —— 如果那条路径漏建了某个
 * store，那个 store 就永久缺失，后面访问它的模块直接抛错。
 */
export const ALL_STORE_NAMES = [
  STORE_NAME,
  GROUPS_STORE_NAME,
  SETTINGS_STORE_NAME,
  SELECTIONS_STORE_NAME,
  EVENT_STORE_NAME,
  SYNC_POINT_STORE_NAME,
  ENTITY_STATE_STORE_NAME,
];
