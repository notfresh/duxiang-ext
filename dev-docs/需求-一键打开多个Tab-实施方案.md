# 需求：一键打开多个Tab - 实施方案

## 需求概述

实现一个"Tab集合"功能，允许用户：
1. 选择多个链接加入到一个集合中
2. 一键打开集合中的所有链接
3. 管理多个集合（创建、编辑、删除、重命名）
4. 入口按钮放在顶部标题栏旁边

## 技术方案

### 数据结构设计

```javascript
// Tab集合数据结构
{
  id: number,              // 集合ID（自增）
  name: string,            // 集合名称
  linkIds: number[],       // 链接ID数组
  createdAt: string,       // 创建时间
  updatedAt: string        // 更新时间
}
```

### 存储方案

- 使用 IndexedDB 存储集合数据
- 在 `storage.js` 中添加集合相关的存储函数
- 创建新的对象存储 `tabGroups`

### UI设计

1. **标题栏按钮**: 在 `<h1>` 标签旁边添加一个"Tab集合"按钮
2. **集合管理对话框**: 
   - 显示所有集合列表
   - 每个集合显示名称、链接数量、操作按钮
   - 支持创建新集合、编辑集合、删除集合
3. **添加链接对话框**: 
   - 显示当前所有链接（带复选框）
   - 支持搜索过滤
   - 支持全选/取消全选
   - 选择后添加到指定集合

### 功能实现

1. **打开多个Tab**: 使用 `chrome.tabs.create()` API 批量创建标签页
2. **权限**: 已有 `tabs` 权限，无需额外权限

## 分阶段实施计划

### 阶段1：基础功能（核心功能）
**目标**: 实现最基本的Tab集合功能

**任务清单**:
1. ✅ 在 `storage.js` 中添加集合存储功能
   - `addTabGroup()` - 创建集合
   - `getTabGroup()` - 获取集合
   - `getAllTabGroups()` - 获取所有集合
   - `updateTabGroup()` - 更新集合
   - `deleteTabGroup()` - 删除集合
2. ✅ 在 `popup.html` 中添加UI元素
   - 标题栏按钮
   - 集合管理对话框
   - 添加链接对话框
3. ✅ 在 `popup.js` 中实现基础功能
   - 打开集合管理对话框
   - 创建新集合
   - 添加链接到集合
   - 一键打开集合中的所有链接
4. ✅ 更新 `manifest.json` 中的数据库版本（如果需要）

**验收标准**:
- 可以创建集合
- 可以选择链接添加到集合
- 可以一键打开集合中的所有链接
- 基本UI可用

### 阶段2：集合管理功能
**目标**: 完善集合管理功能

**任务清单**:
1. ✅ 编辑集合名称
2. ✅ 删除集合
3. ✅ 从集合中移除链接
4. ✅ 集合列表展示优化
5. ✅ 空集合处理

**验收标准**:
- 可以编辑集合名称
- 可以删除集合
- 可以从集合中移除链接
- 集合列表显示正常

### 阶段3：UI优化和增强功能
**目标**: 优化用户体验，添加增强功能

**任务清单**:
1. ✅ 集合列表UI美化
2. ✅ 添加集合描述/备注功能
3. ✅ 集合排序功能
4. ✅ 批量操作（批量添加/移除链接）
5. ✅ 打开Tab时的加载提示
6. ✅ 错误处理和用户提示优化

**验收标准**:
- UI美观易用
- 所有功能稳定可靠
- 用户体验良好

## 实现细节

### 打开多个Tab的实现

```javascript
// 批量打开Tab
async function openTabGroup(group) {
  const links = await loadLinksByIds(group.linkIds);
  for (const link of links) {
    try {
      await chrome.tabs.create({ url: link.url });
      // 添加小延迟，避免浏览器限制
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`打开链接失败: ${link.url}`, error);
    }
  }
}
```

### 数据库迁移

需要在 `storage.js` 的 `initDB` 函数中添加新的对象存储：

```javascript
if (newVersion >= 3 && !db.objectStoreNames.contains('tabGroups')) {
  const store = db.createObjectStore('tabGroups', { keyPath: 'id', autoIncrement: true });
  store.createIndex('name', 'name');
  store.createIndex('createdAt', 'createdAt');
}
```

## 注意事项

1. **浏览器限制**: Chrome对同时打开的Tab数量有限制，需要添加适当的延迟
2. **性能优化**: 大量链接时，需要考虑分批打开
3. **错误处理**: 某些URL可能无法打开，需要妥善处理
4. **用户体验**: 打开大量Tab时，需要给用户反馈

## 后续优化方向

1. 集合导入/导出功能
2. 集合分享功能
3. 定时打开集合功能
4. 集合模板功能




