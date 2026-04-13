/**
 * 设置模块
 * 使用 IndexedDB 存储用户设置
 */

import { getStore, get, put } from './idb.js';
import { getDBInstance } from './storage.js'; // 复用 storage.js 的数据库连接

const SETTINGS_STORE_NAME = 'settings';
const SETTINGS_KEY = 'userSettings';

/**
 * 获取数据库实例（复用 storage.js 的连接，避免重复打开导致冲突）
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
async function getDB() {
  console.log('[settings] 复用 storage.js 的数据库连接');
  return await getDBInstance();
}

/**
 * 获取默认设置
 * @returns {Object} 默认设置对象
 */
export function getDefaultSettings() {
  return {
    compactMode: {
      enabled: false,
      showUrl: true,
      showDate: true,
      showTags: true,
      cardPadding: 12,
      cardMargin: 10,
      titleFontSize: 16,
      urlFontSize: 14,
      metaFontSize: 12,
      titleMaxChars: 0,      // 0表示不限制
      urlMaxChars: 0         // 0表示不限制
    }
  };
}

/**
 * 生成 UUID v4（浏览器环境）
 * @returns {string}
 */
export function generateUUIDv4() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Per RFC4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
  }
  // Fallback simple random
  return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 加载设置
 * @returns {Promise<Object>} 设置对象
 */
export async function loadSettings() {
  try {
    const db = await getDB();
    const store = getStore(db, SETTINGS_STORE_NAME, 'readonly');

    const result = await get(store, SETTINGS_KEY);

    const defaultSettings = getDefaultSettings();

    if (result && result.value) {
      const merged = {
        ...defaultSettings,
        ...result.value,
        compactMode: {
          ...defaultSettings.compactMode,
          ...(result.value.compactMode || {})
        }
      };

      // Ensure deviceId exists; if not, generate and persist it
      if (!merged.deviceId) {
        merged.deviceId = generateUUIDv4();
        try {
          const storeRW = getStore(db, SETTINGS_STORE_NAME, 'readwrite');
          await put(storeRW, { key: SETTINGS_KEY, value: merged, updatedAt: new Date().toISOString() });
        } catch (e) {
          console.warn('Unable to persist generated deviceId:', e);
        }
      }

      return merged;
    }

    // 没有设置时，返回并持久化默认设置（包含 deviceId）
    const defaults = { ...defaultSettings, deviceId: generateUUIDv4() };
    try {
      const storeRW2 = getStore(db, SETTINGS_STORE_NAME, 'readwrite');
      await put(storeRW2, { key: SETTINGS_KEY, value: defaults, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.warn('Unable to persist default settings with deviceId:', e);
    }
    return defaults;
  } catch (error) {
    console.error('加载设置失败:', error);
    const fallback = { ...getDefaultSettings(), deviceId: generateUUIDv4() };
    return fallback;
  }
}

/**
 * 保存设置
 * @param {Object} settings - 设置对象
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  try {
    const db = await getDB();
    const store = getStore(db, SETTINGS_STORE_NAME, 'readwrite');
    const settingsData = {
      key: SETTINGS_KEY,
      value: settings,
      updatedAt: new Date().toISOString()
    };

    await put(store, settingsData);
    return;
  } catch (error) {
    console.error('保存设置失败:', error);
    throw error;
  }
}

// Cached deviceId to avoid repeated DB lookups when possible
let _cachedDeviceId = null;

/**
 * 获取 deviceId（优先返回缓存），若不存在则生成并持久化。
 * @returns {Promise<string>} deviceId
 */
export async function getDeviceId() {
  if (_cachedDeviceId) return _cachedDeviceId;
  try {
    const settings = await loadSettings();
    if (settings && settings.deviceId) {
      _cachedDeviceId = settings.deviceId;
      return _cachedDeviceId;
    }
    // fallback: generate, persist and return
    const newId = generateUUIDv4();
    const s = { ...settings, deviceId: newId };
    await saveSettings(s);
    _cachedDeviceId = newId;
    return _cachedDeviceId;
  } catch (e) {
    // last resort generate but do not persist
    const newid = generateUUIDv4();
    _cachedDeviceId = newid;
    return newid;
  }
}

/**
 * 读取缓存中的 deviceId（可能为 null），用于同步时避免 await
 */
export function getCachedDeviceId() { return _cachedDeviceId; }

/**
 * 更新紧凑模式设置
 * @param {Object} compactModeSettings - 紧凑模式设置对象
 * @returns {Promise<void>}
 */
export async function updateCompactModeSettings(compactModeSettings) {
  const currentSettings = await loadSettings();
  const updatedSettings = {
    ...currentSettings,
    compactMode: {
      ...currentSettings.compactMode,
      ...compactModeSettings
    }
  };
  await saveSettings(updatedSettings);
  return updatedSettings;
}

