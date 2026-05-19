---
name: link-group-assignment-design
description: 新增链接时支持选择一个或多个已有分组，同时支持创建新分组
metadata:
  type: project
---

# 新增链接时分组选择设计

## 需求
在新增链接的两个入口（快捷键、新增按钮）中，允许用户同时将链接加入一个或多个已有分组，或先创建新分组再添加。

## 方案
编辑对话框中增加分组选择区域，包含已有分组的 checkbox 列表和"新建分组"按钮。保存时，将新链接 ID 写入所有选中分组的 `linkIds` 数组。

## 改动范围
- **popup.html**: 编辑对话框 `.input-group` 后增加 `group-select-section`；新增 `groupDialogOverlay` 模态弹窗
- **popup.js**: 引入 `loadGroups` / `addLinkToGroup`; 在 `showEditDialog`/`hideEditDialog` 中管理分组状态; `saveEdit` 成功后遍历 checked groups 调用 `addLinkToGroup`; 实现新建分组弹窗逻辑
