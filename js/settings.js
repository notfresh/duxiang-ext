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
 * 加载设置
 * @returns {Promise<Object>} 设置对象
 */
export async function loadSettings() {
  try {
    const db = await getDB();
    const store = getStore(db, SETTINGS_STORE_NAME, 'readonly');
    
    const result = await get(store, SETTINGS_KEY);
    
    if (result && result.value) {
      // 合并默认设置，确保新添加的选项有默认值
      const defaultSettings = getDefaultSettings();
      return {
        ...defaultSettings,
        ...result.value,
        compactMode: {
          ...defaultSettings.compactMode,
          ...(result.value.compactMode || {})
        }
      };
    }
    
    // 如果没有设置，返回默认设置
    return getDefaultSettings();
  } catch (error) {
    console.error('加载设置失败:', error);
    // 出错时返回默认设置
    return getDefaultSettings();
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
  } catch (error) {
    console.error('保存设置失败:', error);
    throw error;
  }
}

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

