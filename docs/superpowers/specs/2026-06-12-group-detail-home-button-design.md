---
name: group-detail-home-button
description: Add a "back to home" button in the group detail view, but only when the user navigated there directly from the home page's pinned group tags
metadata:
  type: project
---

# 分组详情页"返回主页"按钮（条件显示）

## 概述

修复一个导航可达性问题：从首页（弹窗）顶部置顶分组横条点击直达分组详情时，header 只显示"← 返回分组"，用户无法直接回到首页，必须先返回分组列表再从那里点"← 返回主页"。

约定：**只有从首页直接跳过去时，分组详情才显示"返回主页"按钮**；从分组列表等其它入口进去时维持原状，不显示。

## 问题描述

- [group.html:574-578](group.html#L574-L578) 的 header 里其实已经预留了 `homeBtn`（"← 返回主页"），点击逻辑 [group.js:425-433](group.js#L425-L433) 也已经能正确处理"独立标签→跳 `popup.html`"和"iframe 内→`postMessage('closeOverlay')`"两种场景。
- 但 [group.js:138](group.js#L138) `showGroupView()` 把 `homeBtn` 强制设为 `display: none`，导致分组详情页面只看得见 `backBtn`。
- 首页置顶分组的点击 [popup.js:794](popup.js#L794) 使用 `window.location.href = group.html?groupId=...`，会**整个替换弹窗页面**（与底部"分组管理"按钮走 iframe 覆盖层的路径不同），所以用户失去了弹窗上下文，没法靠其他机制回到首页。

## 修复

### popup.js 改动

[popup.js:793-795](popup.js#L793-L795) 改为追加 `&from=home`：

```js
span.addEventListener('click', () => {
  window.location.href = `group.html?groupId=${g.groupId}&from=home`;
});
```

### group.js 改动

[group.js:136-144](group.js#L136-L144) `showGroupView()` 改为读 `from` 参数：

```js
function showGroupView() {
  const fromHome = urlParams.get('from') === 'home';
  backBtn.style.display = 'block';
  homeBtn.style.display = fromHome ? 'block' : 'none';
  openAllBtn.style.display = 'block';
  addLinkBtn.style.display = 'block';
  searchContainer.style.display = 'block';
  addGroupBtn.style.display = 'none';
}
```

`urlParams` 已在 [group.js:87](group.js#L87) 解析 `groupId` 时定义并赋值，本次直接复用 `urlParams.get('from')`，**不新增模块级变量**。

### 行为矩阵

| 入口 | URL 形式 | backBtn | homeBtn | homeBtn 点击效果 |
|---|---|---|---|---|
| 首页置顶分组点击 | `group.html?groupId=X&from=home` | 显示 | **显示** | 跳 `popup.html` |
| 分组列表→某分组 | `group.html?groupId=X` | 显示 | 隐藏 | — |
| 弹窗底部"分组管理"→iframe→点分组 | `group.html?groupId=X`（在 iframe 内） | 显示 | 隐藏 | — |
| 快捷键 Shift+Alt+G 直开 | `group.html?groupId=X` | 显示 | 隐藏 | — |
| 手动改 URL 加 `&from=home` | `group.html?groupId=X&from=home` | 显示 | 显示 | 跳 `popup.html` |

### 为什么不选其它方案

- **方式 B（sessionStorage 标记）**：URL 干净，但多一层状态、不如 URL 自描述。已被用户排除。
- **治本改用 iframe 覆盖层**：把 `window.location.href` 改成 `openIframeOverlay('group.html?groupId=...')`，跟底部"分组管理"按钮一致，弹窗上下文不丢失。已被用户排除（用户希望保留当前直达行为，只在详情页加按钮）。
- **永远显示 homeBtn（去掉 `from` 条件）**：违反用户明确的"否则不加"约定，且在 iframe 分组列表→分组的场景下"返回主页"语义稍弱（虽然 `postMessage('closeOverlay')` 实际行为正确）。

## 不改动的部分

- [group.html](group.html) 的 header 结构 [L574-578](group.html#L574-L578)：两个按钮的 DOM 本就齐备，本次只动 JS 显隐
- [group.js:425-433](group.js#L425-L433) `homeBtn` 点击逻辑：iframe / 独立标签分支已正确处理
- 弹窗底部"分组管理"按钮 [popup.js:1727](popup.js#L1727) 走 iframe 覆盖层的路径
- 首页置顶分组渲染的其它逻辑（`loadAndRenderPinnedGroups` 其余部分）

## 数据流

```
popup.html
  └─ [置顶分组点击] popup.js:794
       └─ window.location.href = `group.html?groupId=${id}&from=home`
            └─ group.html 加载 → group.js:init()
                 ├─ urlParams.get('groupId') → currentGroupId
                 └─ showGroupView()
                      ├─ urlParams.get('from') === 'home'  →  homeBtn.display = 'block'
                      └─ backBtn.display = 'block'（不变）
                 └─ 用户点 homeBtn
                      └─ homeBtn click handler（L425）
                           └─ window.parent !== window ? 走 iframe 分支
                           └─ 否则 window.location.href = 'popup.html'（独立标签场景，走这条）
```

唯一新增的"信号"是 URL 上的 `from=home`，无新状态、无副作用、刷新页面行为一致。

## 测试方案

仓库目前没有自动化测试基建，采用手动验证。

| # | 场景 | 预期 |
|---|------|------|
| 1 | 打开弹窗 → 顶部置顶分组点击 | 进入分组详情，header 同时出现"← 返回分组"和"← 返回主页"两个按钮 |
| 2 | 接 #1 → 点"← 返回主页" | 跳回 `popup.html`（首页） |
| 3 | 打开弹窗 → 点底部"分组管理"→ 在 iframe 列表里点某分组 | header 只显示"← 返回分组"，**不**显示"← 返回主页" |
| 4 | 接 #3 → 点"← 返回分组" | 回到 iframe 内的分组列表 |
| 5 | 快捷键 Shift+Alt+G 独立开 group.html → 点某分组 | header 只显示"← 返回分组" |
| 6（边界） | 分组详情页改 URL 手动加 `&from=home`，刷新 | homeBtn 出现；点它跳回 popup.html |

## 影响范围

- 修改文件：`popup.js`（1 行）、`group.js`（约 2 行）
- 不涉及数据存储、消息协议、其它视图、CSS

## 后续可考虑（不在本次范围）

- "治本"方案：把首页置顶分组点击也改成 `openIframeOverlay('group.html?groupId=...')`，统一走 iframe 覆盖层。需用户进一步同意
- `group.html` / `group.js` 引入自动化测试基建（vitest / jest），覆盖按钮显隐等纯逻辑
