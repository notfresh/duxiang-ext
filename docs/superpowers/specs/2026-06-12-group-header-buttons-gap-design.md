---
name: group-header-buttons-gap
description: Remove the visible gap between the back and home buttons in group.html header by switching flex layout from space-between to flex-start
metadata:
  type: project
---

# 分组详情页 header 按钮缝隙修复

## 概述

[group.html:574-578](group.html#L574-L578) 的 `.header` 在从首页直达分组详情（同时显示"← 返回分组"和"← 返回主页"两个按钮）时，两个按钮之间有一条明显的缝隙，视觉上像被强行拉开。本次改为 flex-start 紧贴布局，让两个按钮相邻。

## 问题描述

- 上一轮"条件显示返回主页按钮"完成后（spec `2026-06-12-group-detail-home-button-design`），group.html 的 `.header` 在 `from=home` 场景下首次出现"两个 back-btn 按钮 + 一个空 span"共存
- 现有 CSS（[group.html:38-44](group.html#L38-L44)）：

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px 10px;
  background-color: #f5f5f5;
}
```

- `space-between` 把三个子元素（backBtn / span / homeBtn）分散到头/中/尾，backBtn 和 homeBtn 中间被空 span 撑出大缝
- 单按钮视图（分组列表、Shift+Alt+G 直开）下也有这个 span，但只有 1 个按钮可见时 span 落在另一侧，视觉无异常
- 仅"两按钮共存"场景出问题

## 修复

### 改动 1：CSS（[group.html:38-44](group.html#L38-L44)）

`justify-content: space-between` → `flex-start`，新增 `gap: 0`：

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

### 改动 2：HTML（[group.html:574-578](group.html#L574-L578)）

删掉空 `<span></span>`：

```html
<div class="header">
    <button id="backBtn" class="back-btn">← 返回分组</button>
    <button id="homeBtn" class="back-btn" style="display: none;">← 返回主页</button>
</div>
```

### 为什么这样改

- `flex-start` + `gap: 0` 让多个 back-btn 自然紧贴左侧；空 span 没用了顺手删掉
- 不引入新 class、不动 `.back-btn` 自身样式
- `.header` 在 group.html 里仅此一处使用，副作用范围明确

### 为什么不选其它方案

- **用 margin/padding 凑**：依赖按钮数量，扩展性差
- **包一个 `<div class="header-buttons">` 容器**：结构更复杂，且两按钮实际就该贴在一起，不需要单独容器
- **保留 span 改其它 CSS**：span 没有任何用途，留着只会让未来"标题在 header 右侧"等需求更容易引起混乱

## 不改动的部分

- 按钮自身的 `.back-btn` 样式
- `group.html` 内其它 class 与结构
- `group.js` 的 `showGroupView` / `showGroupsListView` 显隐逻辑
- popup.html / popup.css / popup.js 全部不动

## 影响范围

- 仅修改 [group.html](group.html) 一处 CSS + 一处 HTML
- 不涉及数据存储、消息协议、其它视图

## 视图影响矩阵

| 视图 | backBtn | homeBtn | 视觉效果 | 改动前后对比 |
|---|---|---|---|---|
| 分组列表（任意入口） | `display: none` | `display: block` | 单按钮居左 | 无变化 |
| 分组详情，从分组列表/快捷键进入 | `display: block` | `display: none` | 单按钮居左 | 无变化 |
| 分组详情，从首页置顶分组进入 | `display: block` | `display: block` | 两按钮紧贴居左 | **修复**：原本两按钮中间有大缝 |

## 测试方案

仓库无自动化测试基建，手动验证：

| # | 场景 | 预期 |
|---|------|------|
| 1 | 弹窗 → 顶部置顶分组点击 | 分组详情 header 两个按钮**紧贴**，中间无缝隙 |
| 2 | 弹窗 → 底部"分组管理" → iframe 内点分组 | header 单按钮"← 返回分组"，**视觉无变化** |
| 3 | 快捷键 Shift+Alt+G 直开 → 点分组 | header 单按钮"← 返回分组"，**视觉无变化** |
| 4 | 任意路径返回到分组列表视图 | header 单按钮"← 返回主页"，**视觉无变化** |

## 后续可考虑（不在本次范围）

- 如未来想给 header 加"批量打开"图标按钮（▶），可以包一个 `.header-buttons` flex 容器把"返回类 + 操作类"按钮分组；本次不做
