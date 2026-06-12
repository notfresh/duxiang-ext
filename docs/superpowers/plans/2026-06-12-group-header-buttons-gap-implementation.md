# 分组详情页 header 按钮缝隙修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 group.html 的 `.header` 在两个 back-btn 按钮共存时紧贴无缝隙，其它视图视觉无变化。

**Architecture:** 改 `justify-content: space-between` → `flex-start` + `gap: 0`；删掉没用的空 `<span></span>`。仅 CSS + 一处 HTML。

**Tech Stack:** vanilla CSS, HTML

---

## 文件结构

```
duxiang-ext/
└── group.html               # 修改：.header CSS + 删除空 span
```

无新文件、无新依赖。

---

## Task 1: 改 CSS 布局 + 删空 span

**Files:**
- Modify: `group.html:38-44` (CSS)
- Modify: `group.html:574-578` (HTML)

- [ ] **Step 1: 改 .header CSS**

把 [group.html:38-44](group.html#L38-L44)：

```css
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 10px 10px;
      background-color: #f5f5f5;
    }
```

改为：

```css
    .header {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 0;
      padding: 0 10px 10px;
      background-color: #f5f5f5;
    }
```

- [ ] **Step 2: 删空 span**

把 [group.html:574-578](group.html#L574-L578)：

```html
  <div class="header">
    <button id="backBtn" class="back-btn">← 返回分组</button>
    <button id="homeBtn" class="back-btn" style="display: none;">← 返回主页</button>
    <span></span>
  </div>
```

改为：

```html
  <div class="header">
    <button id="backBtn" class="back-btn">← 返回分组</button>
    <button id="homeBtn" class="back-btn" style="display: none;">← 返回主页</button>
  </div>
```

- [ ] **Step 3: 视觉确认两处改动**

```bash
grep -n "justify-content: flex-start\|gap: 0\|<span></span>" "/c/projects/duxiang-pack/duxiang-ext/group.html"
```

预期输出：

```
39:      justify-content: flex-start;
42:      gap: 0;
```

`<span></span>` 那条不应该再出现。如果还出现，说明 Step 2 没改干净。

- [ ] **Step 4: 提交**

```bash
git add group.html
git commit -m "fix(group): tighten header button layout to remove gap"
```

---

## Task 2: 手动验证 4 个视图

**Files:** 无（纯验证步骤）

- [ ] **Step 1: 用例 #1 — 两按钮紧贴（修复目标）**

加载扩展 → 首页顶部置顶分组点击。

**预期**：分组详情 header 的"← 返回分组"和"← 返回主页"**紧贴无缝隙**。

- [ ] **Step 2: 用例 #2 — iframe 分组详情单按钮视觉无变化**

弹窗 → 底部"分组管理" → iframe 内点某分组。

**预期**：header 只有"← 返回分组"按钮，居左，**与之前视觉一致**。

- [ ] **Step 3: 用例 #3 — 快捷键直开单按钮视觉无变化**

Shift+Alt+G 直开 → 点某分组。

**预期**：header 只有"← 返回分组"按钮，居左，**与之前视觉一致**。

- [ ] **Step 4: 用例 #4 — 分组列表视图单按钮视觉无变化**

任意路径进入分组列表（不点任何分组）。

**预期**：header 只有"← 返回主页"按钮，居左，**与之前视觉一致**。

- [ ] **Step 5: 验证完成**

4 个用例全部通过 → 本次功能完成。无需再提交代码（已在 Task 1 Step 4 提交）。

任一用例失败 → 检查改动、`git commit --amend` 或新增 fixup commit 修复后重跑。

---

## 收尾

- [ ] **Step 1: 确认 git log**

```bash
git log --oneline -3
```

预期看到 1 个新 commit：

```
fix(group): tighten header button layout to remove gap
```

- [ ] **Step 2: 确认 working tree 干净（与本次相关文件）**

```bash
git diff --name-only
```

预期输出为空（针对本次改动的 group.html 没有未提交修改；其它 pre-existing 的未提交文件改动不在本次范围）。
