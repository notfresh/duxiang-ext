# 分组详情页"返回主页"按钮（条件显示）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在从首页置顶分组直达分组详情时，让 header 同时显示"返回分组"和"返回主页"两个按钮；其它入口维持原状。

**Architecture:** URL 传 `from=home` 标识入口来源；`group.js` 的 `showGroupView()` 读该参数，决定 `homeBtn` 的显隐。`homeBtn` 的点击逻辑保持原样（已能正确处理独立标签和 iframe 两种场景）。

**Tech Stack:** vanilla JS ES6 modules, Chrome Extension Manifest V3

---

## 文件结构

```
duxiang-ext/
├── popup.js                # 修改 1 行：置顶分组点击 URL 追加 &from=home
├── group.js                # 修改约 2 行：showGroupView 读 from 参数
└── docs/superpowers/
    ├── specs/2026-06-12-group-detail-home-button-design.md   # 已存在
    └── plans/2026-06-12-group-detail-home-button-implementation.md   # 本文件
```

无新文件、无新依赖、无新消息协议、无 CSS/HTML/manifest 变更。

---

## Task 1: 弹出页面置顶分组点击追加 from=home 参数

**Files:**
- Modify: `popup.js:793-795`

- [ ] **Step 1: 修改置顶分组点击的 URL**

把 [popup.js:793-795](popup.js#L793-L795)：

```js
span.addEventListener('click', () => {
  window.location.href = `group.html?groupId=${g.groupId}`;
});
```

改为：

```js
span.addEventListener('click', () => {
  window.location.href = `group.html?groupId=${g.groupId}&from=home`;
});
```

- [ ] **Step 2: 视觉确认改动正确**

打开仓库根目录的 `popup.js`，搜索 `from=home`，应只出现 1 处（刚才的修改）。

```bash
grep -n "from=home" popup.js
```

预期输出：

```
794:        window.location.href = `group.html?groupId=${g.groupId}&from=home`;
```

- [ ] **Step 3: 提交**

```bash
git add popup.js
git commit -m "feat(popup): tag pinned group click with from=home for group detail"
```

---

## Task 2: 分组详情页根据 from 参数显示"返回主页"按钮

**Files:**
- Modify: `group.js:136-144` (`showGroupView` 函数)

- [ ] **Step 1: 修改 showGroupView 读 from 参数**

把 [group.js:136-144](group.js#L136-L144)：

```js
// 显示组内视图
function showGroupView() {
  backBtn.style.display = 'block';
  homeBtn.style.display = 'none';
  openAllBtn.style.display = 'block';
  addLinkBtn.style.display = 'block';
  searchContainer.style.display = 'block';
  addGroupBtn.style.display = 'none';
  // 标题在 loadGroupLinks 中根据分组名设置
}
```

改为：

```js
// 显示组内视图
function showGroupView() {
  const fromHome = urlParams.get('from') === 'home';
  backBtn.style.display = 'block';
  homeBtn.style.display = fromHome ? 'block' : 'none';
  openAllBtn.style.display = 'block';
  addLinkBtn.style.display = 'block';
  searchContainer.style.display = 'block';
  addGroupBtn.style.display = 'none';
  // 标题在 loadGroupLinks 中根据分组名设置
}
```

**关键点**：`urlParams` 是模块顶部已在 [group.js:87](group.js#L87) 通过 `new URLSearchParams(window.location.search)` 定义的 `const`，可被 `showGroupView` 直接访问（`init()` 内部后续也有同样的 [group.js:421-422](group.js#L421-L422) 用法）。**不要新增模块级变量**。

- [ ] **Step 2: 视觉确认改动正确**

打开 `group.js`，搜索 `fromHome`，应只出现 2 处（const 声明和三元判断）：

```bash
grep -n "fromHome\|urlParams.get('from')" group.js
```

预期输出（行号可能因编辑器而异）：

```
139:  const fromHome = urlParams.get('from') === 'home';
140:  homeBtn.style.display = fromHome ? 'block' : 'none';
```

如果出现第 3 处或更多，说明误改。

- [ ] **Step 3: 提交**

```bash
git add group.js
git commit -m "feat(group): show back-to-home button in group detail when navigated from home"
```

---

## Task 3: 端到端手动验证（6 个测试用例）

**Files:** 无（验证步骤，不修改代码）

本仓库无自动化测试基建（已确认），按 spec 的 6 个手动测试用例逐一验证。

**前置准备**：
- 在 Chrome/Edge 加载未打包扩展（`chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序 → 选仓库根目录）
- 至少有一个**已置顶**的分组（popup → 编辑任一链接 → 分组 → 置顶该分组）
- 至少有 2 个分组（方便测试从分组列表进入的场景）

- [ ] **Step 1: 用例 #1 — 首页置顶分组点击后双按钮出现**

打开弹窗（点扩展图标）→ 顶部置顶分组横条点其中一个分组。

**预期**：进入分组详情页（独立标签页或弹窗内，取决于扩展触发方式），header 同时显示"← 返回分组"和"← 返回主页"两个按钮。

- [ ] **Step 2: 用例 #2 — 点击"返回主页"跳回首页**

接 Step 1，**不关闭当前标签**，点"← 返回主页"。

**预期**：跳回 `popup.html`（首页列表视图）。

- [ ] **Step 3: 用例 #3 — 弹窗底部"分组管理"进入分组详情时单按钮**

打开弹窗 → 点底部"分组管理"按钮 → 在 iframe 覆盖层内点任一分组卡。

**预期**：header 只显示"← 返回分组"按钮，**不**显示"← 返回主页"按钮（覆盖层场景保留原行为）。

- [ ] **Step 4: 用例 #4 — iframe 场景"返回分组"工作正常**

接 Step 3，**在 iframe 内**点"← 返回分组"。

**预期**：iframe 内回到分组列表，覆盖层保持打开。

- [ ] **Step 5: 用例 #5 — 快捷键 Shift+Alt+G 直开进入详情时单按钮**

按 `Shift+Alt+G` 独立打开 group.html 标签页 → 在分组列表点任一分组。

**预期**：header 只显示"← 返回分组"按钮。

- [ ] **Step 6: 用例 #6（边界）— 手动改 URL 加 from=home**

在任何分组详情页（独立标签），地址栏手动在 URL 末尾追加 `&from=home`，按回车刷新。

**预期**：homeBtn 出现；点它跳回 `popup.html`。

- [ ] **Step 7: 提交验证记录（可选）**

如果 6 个用例全部通过，本次功能完成。无需再提交代码（代码已在 Task 1、Task 2 提交）。

如果**任一**用例失败：
- 回到对应 Task 检查改动
- 修复后重新跑失败的用例
- 用 `git commit --amend`（推荐）或新增 fixup commit 提交修复

---

## 收尾

- [ ] **Step 1: 确认 git log**

```bash
git log --oneline -3
```

预期看到 2 个新 commit（顺序可换）：

```
feat(group): show back-to-home button in group detail when navigated from home
feat(popup): tag pinned group click with from=home for group detail
```

- [ ] **Step 2: 确认工作区干净**

```bash
git status
```

预期：`nothing to commit, working tree clean`。
