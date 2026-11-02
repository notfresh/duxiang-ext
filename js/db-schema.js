/**
 * 数据库 schema —— 单一来源。
 *
 * 为什么单独一个文件：三处都会开数据库连接（storage.js / eventlog.js /
 * background.js），每个连接都有自己的 onupgradeneeded 回调。IndexedDB 的
 * 规则是「**哪个连接触发了升级，就只跑那个连接的** onupgradeneeded」——
 * 其它连接的建表逻辑不会跑。
 *
 * 所以如果三处各写一份建表语句，先打开的连接建了它认��的 store，后打开的
 * 连接发现自己的 store 不存在 → 运行时炸（NoSuchObjectStore / 事务报错）。
 * 把建表逻辑收敛到这一个函数，三处都调它，谁先打开都能建齐。
 *
 * 依赖方向：本文件 import db-constants.js（纯常量），不 import 别的。
 */

import {
  ALL_STORE_NAMES,
  STORE_NAME,
  GROUPS_STORE_NAME,
  SETTINGS_STORE_NAME,
  EVENT_STORE_NAME,
  SYNC_POINT_STORE_NAME,
  ENTITY_STATE_STORE_NAME,
} from './db-constants.js';

/**
 * 建齐所有对象存储（幂等 —— 已存在的跳过）。
 *
 * @param {IDBDatabase} db 处于 onupgradeneeded 回调中的数据库
 */
export function ensureAllStores(db) {
  for (const name of ALL_STORE_NAMES) {
    if (db.objectStoreNames.contains(name)) continue;

    switch (name) {
      case STORE_NAME: {
        const s = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        s.createIndex('url', 'url', { unique: true });
        s.createIndex('timestamp', 'timestamp');
        break;
      }
      case GROUPS_STORE_NAME:
        db.createObjectStore(GROUPS_STORE_NAME, { keyPath: 'groupId' });
        break;
      case SETTINGS_STORE_NAME:
        db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'key' });
        break;
      case EVENT_STORE_NAME: {
        const s = db.createObjectStore(EVENT_STORE_NAME, { keyPath: 'id' });
        s.createIndex('topic_process', ['topic', 'process_time'], { unique: false });
        s.createIndex('topic', 'topic', { unique: false });
        s.createIndex('entity', ['topic', 'entity_id'], { unique: false });
        break;
      }
      case SYNC_POINT_STORE_NAME:
        db.createObjectStore(SYNC_POINT_STORE_NAME, { keyPath: 'key' });
        break;
      case ENTITY_STATE_STORE_NAME:
        db.createObjectStore(ENTITY_STATE_STORE_NAME, { keyPath: 'key' });
        break;
      default:
        break;
    }
  }
}
