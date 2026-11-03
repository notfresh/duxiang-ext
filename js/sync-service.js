/**
 * sync-service —— 同步编排层。
 *
 * 职责：把「事件流模块（eventlog）」「折叠器（link-applier）」「业务表
 * （storage）」串成一次完整的同步。自身不含协议细节 —— 那些都在 eventlog.js。
 *
 * 为什么要这一层：
 *   · bootstrap（把同步配置之前就存在的链接补记成事件）需要同时访问
 *     links 表和事件表 —— eventlog.js 不 import storage.js（避免环），
 *     storage.js import eventlog.js，所以编排只能放在两者之上。
 *   · 折叠远端事件必须在「不产生事件」的作用域内跑（否则回声循环）——
 *     这个作用域由 storage.js 提供，但怎么用只有编排层知道。
 */

import { loadAllLinksRaw, setRemoteApplyScope } from './storage.js';
import {
  TOPIC_LINKS,
  record,
  pushPending,
  pull,
  loadSyncConfig,
  isSyncConfigured,
  getSyncPoint,
  setSyncPoint,
} from './eventlog.js';
import { applyLinkEvent } from './link-applier.js';

/** bootstrap 标志的 key —— 存在 sync_point store 里。 */
const BOOTSTRAP_KEY = `bootstrap:${TOPIC_LINKS}`;

/**
 * 读 bootstrap 标志。
 */
async function isBootstrapped() {
  const v = await getSyncPoint(BOOTSTRAP_KEY);
  return v === 'done';
}

/**
 * 补记历史链接为 create 事件。
 *
 * 为什么需要：用户在配置同步服务器**之前**就收藏的链接，那些写入发生时
 * 没有 deviceId / 没配服务器，记不成事件 —— 手机端就永远看不到它们。
 * 这跟 Android 端的 bootstrapEventLogIfNeeded 是同一个问题。
 *
 * 幂等：靠 bootstrap 标志，已做过就不重复做。
 */
export async function bootstrapIfNeeded() {
  if (await isBootstrapped()) return 0;

  const cfg = await loadSyncConfig();
  if (!cfg.deviceId) return 0;

  const links = await loadAllLinksRaw();
  console.log(`[sync] bootstrap：补记 ${links.length} 条历史链接`);

  let count = 0;
  for (const link of links) {
    const url = (link.url || '').trim();
    if (!url) continue;
    const eventTime = Date.parse(link.timestamp || '') || Date.now();
    await record(TOPIC_LINKS, url, 'create', {
      title: link.title || '',
      url: url,
      tags: Array.isArray(link.tags) ? link.tags : [],
      timestamp: link.timestamp || new Date().toISOString(),
      pinned: !!link.pinned,
    }, null, eventTime);
    count++;
  }

  await setSyncPoint(BOOTSTRAP_KEY, 'done');
  console.log(`[sync] bootstrap 完成，补记 ${count} 条`);
  return count;
}

/**
 * 执行一次完整同步：bootstrap → push → pull。
 *
 * @returns {Promise<{success: boolean, message: string, pushed?: number, pulled?: number}>}
 */
export async function syncNow() {
  if (!await isSyncConfigured()) {
    return { success: false, message: '请先配置服务器地址、密钥和设备 ID' };
  }

  const t0 = performance.now();
  try {
    const tb = performance.now();
    await bootstrapIfNeeded();
    console.log(`[sync][计时] bootstrap ${Math.round(performance.now() - tb)}ms`);

    const tp = performance.now();
    const pushed = await pushPending(TOPIC_LINKS);
    console.log(`[sync][计时] push ${Math.round(performance.now() - tp)}ms (${pushed} 条)`);
    if (pushed < 0) {
      return { success: false, message: '推送失败（游标未推进，下次重试）' };
    }

    // 折叠在「不产生事件」的作用域内跑 —— 否则拉回来的事件会被再记一遍
    // 推回服务端，形成回声循环。
    const tl = performance.now();
    const pulled = await setRemoteApplyScope(() => pull(applyLinkEvent));
    console.log(`[sync][计时] pull ${Math.round(performance.now() - tl)}ms (${pulled} 条) | syncNow 总计 ${Math.round(performance.now() - t0)}ms`);
    if (pulled < 0) {
      return { success: false, message: `推送 ${pushed} 条成功，但拉取失败`, pushed, pulled: 0 };
    }

    return {
      success: true,
      message: `同步完成：上传 ${pushed} 条，下载 ${pulled} 条`,
      pushed,
      pulled,
    };
  } catch (error) {
    console.error('[sync] 同步异常:', error);
    return { success: false, message: `同步异常: ${error.message}` };
  }
}

/**
 * 只拉不推 —— 弹窗打开时用（手机端新增的链接，用户下次开插件就能看到）。
 */
export async function pullOnly() {
  if (!await isSyncConfigured()) return { success: false, message: '未配置同步' };
  try {
    const pulled = await setRemoteApplyScope(() => pull(applyLinkEvent));
    return { success: true, message: `拉取 ${pulled} 条`, pulled };
  } catch (error) {
    console.error('[sync] 拉取异常:', error);
    return { success: false, message: `拉取异常: ${error.message}` };
  }
}
