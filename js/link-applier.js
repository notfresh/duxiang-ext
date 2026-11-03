/**
 * link-applier —— 把远端 links topic 的事件折叠进本地 links 表。
 *
 * 折叠规则（PROTOCOL §5.4）：
 *   · 同一 entity_id（= url）的多条事件，按 process_time 升序处理，后到的赢
 *   · 字段级 LWW：用事件的 old（变更前快照）算 diff，只覆盖改动过的字段
 *     —— 两端同时改同一链接的不同字段时不会互相盖掉
 *   · old 缺失 → 退化为实体级 LWW（整条覆盖）
 *   · delete 是 tombstone：整条删除，不做字段级
 *
 * 去重规则：本地同一个 url 可能有多行（插件端 url 是 unique 索引，正常不会；
 * 但历史数据或异常路径可能留下重复）。折叠时保留**最新那条**（按
 * timestamp），其余删掉 —— 保证「一条 url 一条记录」，两端才能收敛。
 *
 * 依赖方向：本模块 import js/storage.js（业务表），js/storage.js import
 * js/eventlog.js（埋点）。eventlog.js 不 import 两者 —— 是叶子节点。
 */

import {
  getLinkByUrl,
  getLinksByUrlAll,
  upsertLinkByUrl,
  removeLinkById,
  setRemoteApplyScope,
} from './storage.js';
import {
  TOPIC_LINKS,
  getEntityState,
  setEntityState,
  isNewerThan,
  diffFields,
  mergeByFields,
  toWire,
  fromWire,
} from './eventlog.js';

/**
 * 折叠一条远端事件。
 *
 * @param {object} event 远端事件
 */
export async function applyLinkEvent(event) {
  if (!event || event.topic !== TOPIC_LINKS) return;

  const entityId = event.entity_id; // = url
  if (!entityId) return;

  // 同一 entity 的旧事件不重复应用（客户端可能重复拉到同一段事件流）
  const state = await getEntityState(TOPIC_LINKS, entityId);
  if (!isNewerThan(state, event)) return;

  // delete = tombstone：整条删除
  if (event.action === 'delete') {
    await removeLinkByUrl(entityId);
    await setEntityState(TOPIC_LINKS, entityId, {
      process_time: event.process_time,
      data: null,
    });
    return;
  }

  const remote = event.data;
  if (!remote || !remote.url) return;

  // 字段级 LWW：只覆盖这条事件改动过的字段
  const changed = diffFields(event.old, remote);

  const local = await getLinkByUrl(entityId);
  if (!local) {
    // 本地没有这条 → 整条落地（create 语义）
    await upsertLinkByUrl(fromWire(remote));
  } else {
    // 字段级 LWW：只覆盖这条事件改动过的字段。
    //
    // 注意顺序：**先在 wire 格式上算 diff**（old 和 remote 都是协议层格式，
    // 字段名和类型一致），再把改动过的字段搬到本地格式上合并。
    // 反过来做（先转本地格式再 diff）会算错 —— tags 在本地是逗号串、在
    // wire 上是数组，两边永远不等，每次都算「改了」。
    const changed = diffFields(event.old, remote);
    const wire = remote; // 已经是协议层格式
    const localWire = toWire(local);
    const mergedWire = mergeByFields(localWire, wire, changed);
    await upsertLinkByUrl(fromWire(mergedWire));
  }

  // 收敛本地同 url 的重复行：保留最新那条，其余删掉
  await dedupeByUrl(entityId);

  await setEntityState(TOPIC_LINKS, entityId, {
    process_time: event.process_time,
    data: remote,
  });
}

/**
 * 删除本地所有 url 匹配的链接（tombstone 生效）。
 */
async function removeLinkByUrl(url) {
  const matches = await getLinksByUrlAll(url);
  for (const m of matches) {
    await removeLinkById(m.id);
  }
}

/**
 * 同一个 url 有多行时：保留 timestamp 最新的那条，其余删掉。
 */
async function dedupeByUrl(url) {
  const matches = await getLinksByUrlAll(url);
  if (matches.length <= 1) return;

  const sorted = matches.slice().sort((a, b) => {
    const ta = Date.parse(a.timestamp || '') || 0;
    const tb = Date.parse(b.timestamp || '') || 0;
    return tb - ta; // 新的在前
  });
  const keep = sorted[0];
  for (const m of sorted.slice(1)) {
    await removeLinkById(m.id);
  }
  console.log(`[link-applier] 收敛重复 url，保留 id=${keep.id}，删除 ${sorted.length - 1} 条`);
}
