---
name: search-clear-button-visibility
description: Fix bug where popup search input × clear button stays hidden after picking a keyword from the search history dropdown
metadata:
  type: project
---

# 搜索框 × 清除按钮可见性修复

## 概述

修复 popup 搜索框的一个 bug：从搜索历史下拉列表选择关键词填入输入框后，右侧的 × 清除按钮仍然不可见。该行为与手动键入时不一致，让用户无法通过 × 清除已选的关键词。

设计意图不变：× 仅在搜索框有内容时显示。**本次只修 bug，不调整"有内容才显示"这一设计。**

## 问题描述

- popup 顶部搜索框右侧有一个 × 清除按钮（`#clearSearchBtn`）
- 行为约定：输入框为空时 × 隐藏，有内容时 × 显示
- bug：从搜索历史下拉里点选关键词后，输入框已被填充但 × 仍是隐藏状态

## 根因

× 可见性唯一更新点在 [js/search.js:152-154](js/search.js#L152-L154)（`performSearch` 内）：

```js
if (clearBtn) {
  clearBtn.style.display = searchText ? 'block' : 'none';
}
```

`performSearch` 仅在 `input` 事件触发时被调用（[js/search.js:165](js/search.js#L165)，带 300ms 防抖）。

而 [popup.js:586](popup.js#L586) 在历史下拉的点击处理器里使用 `searchInput.value = keyword` 直接赋值——**程序化赋值不会触发 `input` 事件**，因此 `performSearch` 不执行，× 维持初始的 `display: none`。

手动键入、粘贴、剪贴等操作都会触发 `input` 事件，所以这些路径表现正常；唯一漏掉的入口就是历史下拉点击。

## 修复

在 [popup.js:586-587](popup.js#L586-L587) 之间插入一行，显式同步 × 的可见性：

```js
searchInput.value = keyword;
searchHistoryDropdown.style.display = 'none';

// 修复：程序化赋值不会触发 input 事件，需要手动同步清除按钮可见性
if (clearSearchBtn) {
  clearSearchBtn.style.display = 'block';
}
```

### 为什么不选其它方案

- **派发 `input` 事件**（`dispatchEvent(new Event('input'))`）：会触发 300ms 防抖，且 `setupSearch` 的 `input` 监听器会重新执行搜索，与该处理器中已手搜一次的行为重复。
- **重构 `setupSearch` 暴露 `applyKeyword(value)`**：架构更整洁，但偏离"仅修 bug"的最小改动诉求，且需要同时改 `js/search.js` 和调用方。

## 不改动的部分

- `popup.html` / `popup.css`：HTML 结构和 CSS 不动
- `js/search.js`：× 可见性逻辑保持原样（仍由 `performSearch` 在 `input` 事件中驱动）
- "× 仅在有内容时显示"的设计：保持不变

## 测试方案

仓库目前没有自动化测试基建，采用手动验证。

| # | 场景 | 预期 | 修复前 | 修复后 |
|---|------|------|--------|--------|
| 1 | popup 打开，搜索框为空 | × 不可见 | ✓ | ✓ |
| 2 | 手动键入"abc" | × 出现 | ✓ | ✓ |
| 3 | **从搜索历史下拉里点选关键词** | × 立即出现 | ✗ | ✓ |
| 4 | × 出现后点击 × | 输入清空、× 消失、历史下拉弹出 | ✓ | ✓ |
| 5 | 粘贴文本到搜索框 | × 出现 | ✓ | ✓ |

重点关注 case 3：这是本次修复的 bug 路径。

## 影响范围

- 仅修改 [popup.js](popup.js) 一处
- 涉及文件：`popup.js`（+1 行）
- 不涉及数据存储、消息协议、其它视图

## 后续可考虑（不在本次范围）

- `group.html` / `group.js` 的搜索框存在相同的 `value =` 程序化赋值模式（[group.js:764](group.js#L764) 处只赋空值，但其它入口未审），可单开 spec 跟进
- 仓库引入自动化测试基建（vitest / jest），覆盖可见性等纯逻辑
