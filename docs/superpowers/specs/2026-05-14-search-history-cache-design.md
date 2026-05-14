---
name: search-history-cache
description: LRU search history cache with pin support for the browser extension popup
metadata:
  type: project
---

# 搜索历史缓存设计

## 概述

在 popup 搜索框增加历史搜索词的 LRU 缓存功能，支持 pin（固定）和手动删除。Pin 的关键词永远不被淘汰。

## 数据结构

存储在 `chrome.storage.local`，key 为 `searchHistory`：

```js
{
  items: [
    { text: "react", pinned: true, lastUsed: 1715760000000 },
    { text: "tag:前端", pinned: false, lastUsed: 1715759000000 },
  ]
}
```

- `items` 按 `lastUsed` 倒序排列
- 最大非 pinned 条目数默认 10，可在设置页配置

## 模块：`js/searchHistory.js`

新建独立模块，导出以下方法：

| 方法 | 说明 |
|------|------|
| `loadHistory()` | 返回完整历史列表（pinned 在前，非 pinned 在后） |
| `addSearchKeyword(keyword)` | 记录搜索词，更新 lastUsed，触发 LRU 淘汰 |
| `togglePinKeyword(keyword)` | 切换 pin 状态 |
| `deleteKeyword(keyword)` | 删除指定历史词 |
| `getMaxCount()` | 获取当前最大数量配置 |
| `setMaxCount(count)` | 设置最大数量，超出部分立即淘汰 |

### 淘汰策略

- pinned 条目永远不被淘汰
- 非 pinned 条目按 `lastUsed` 时间戳倒序，超过 `maxCount` 的部分被淘汰
- `addSearchKeyword`：词已存在则更新 lastUsed；不存在则新增后淘汰最老的非 pinned 条目
- `setMaxCount`：减少上限时立即淘汰多余的非 pinned 条目

## UI 交互

### 搜索框下拉列表

- 搜索框获得焦点 **且输入为空** 时，弹出下拉列表
- 列表结构：`[pinned 词区]` + 分隔线 + `[普通历史词区]`
- 每个词右侧操作图标：`[文本]  📌  ✕`
  - 📌：未 pin 空心，已 pin 实心，点击切换
  - ✕：删除该条历史词
- 点击历史词文本：填入搜索框 → 触发搜索 → 调用 `addSearchKeyword` 更新 lastUsed
- 输入非空时不显示历史下拉框（保持现有搜索行为）

### 焦点管理

- `focus`：显示下拉列表
- `blur`：延迟 200ms 隐藏（防止点击列表项时先 blur 导致 click 不触发）

## 设置页集成

在设置对话框新增 section：

```
搜索历史：
  最大保存条数：[10] （数字输入框，默认 10）
```

存储在现有设置中，新增 `searchHistory: { maxCount: 10 }` 到 compactMode 同级。

## 调用时机（`popup.js`）

1. `DOMContentLoaded`：调用 `loadHistory()` 预加载
2. 搜索框 `focus`（且输入为空）：显示下拉列表
3. 每次搜索执行时：调用 `addSearchKeyword` 记录
4. 点击 📌：调用 `togglePinKeyword`，重新渲染列表
5. 点击 ✕：调用 `deleteKeyword`，重新渲染列表
6. 设置保存时：如 maxCount 变化，调用 `setMaxCount`

## 错误处理

- storage 读取失败：返回空数组，静默降级
- 删除不存在的词：静默处理，不报错
