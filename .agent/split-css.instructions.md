
# 拆分 CSS 样式 Skill

目的
- 将 HTML 文件中内联的 `<style>` 内容提取到独立的 CSS 文件，并在原 HTML 中用 `<link rel="stylesheet" href="...">` 引入。

适用场景
- 快速把页面的样式抽离，保持 HTML 只关注结构和脚本。
- 支持单文件提取或批量处理工作区内匹配的 HTML 文件。

行为规范（Agent 执行时遵循）
1. 询问确认：在对文件修改前，询问用户是否按 **逐个文件交互式** 或 **批量自动** 模式执行。若逐个文件，询问目标 CSS 名称或路径；若批量自动，使用约定生成名。
2. 识别候选样式块：在目标 HTML 中查找第一个或所有 `<style[^>]*>...</style>` 区块（支持带有属性的 `<style scoped>` 等）。
3. 提取顺序：保持样式出现顺序不变。若多个 `<style>`，可以合并到同一个 CSS 文件（默认）或按位置分别拆分（按用户选择）。
4. 生成文件名规则（可配置）：
   - 默认：与 HTML 同名，扩展名改为 `.css`（例如 `popup.html` → `popup.css`），放在同一目录。
   - 若已存在文件，则在文件名后追加 `.extracted.css` 或使用用户输入的新文件名。
5. 替换 HTML：用单行 `<link rel="stylesheet" href="<REL_PATH>">` 替换原先的 `<style>...</style>` 区块。
   - 相对路径：生成相对于 HTML 文件的相对路径（通常 `./popup.css` 或 `popup.css`）。
6. 保留注释：将 `<style>` 内的注释保留到新 CSS 文件顶部，添加一行注释标注“由 agent 提取，原始文件：<filename>”。
7. 不破坏其他内容：不修改 HTML 除 `<style>` 区块外的任何其它内容（包括脚本标签、内联事件等）。
8. 当无法自动安全拆分（例如动态生成或模板语言中嵌套特殊标记）时，中断并提示用户手动确认或提供排除模式。

步骤模板（agent 可直接执行）
1. 读取并解析 HTML 文本（文本模式即可，正则或 DOM 均可）。
2. 找到 `<style[^>]*>([\s\S]*?)</style>` 的所有匹配项。
3. 如果无匹配，向用户报告“未检测到内联样式”，并结束操作。
4. 询问用户：
   - 合并所有 `style` 到一个 CSS 文件？（默认：是）
   - 目标 CSS 文件名（默认：`<html-basename>.css`）
5. 生成 CSS 文件内容：在文件顶部加入注释块：
   ```
   /* Extracted from <path/to/file.html> by split-css skill on <DATE> */
   /* Original style blocks preserved below */
   ```
   然后按原顺序粘贴每个 style 内容。
6. 用 `<link rel="stylesheet" href="<rel-path>">` 替换原先的所有 `<style>`（若合并为一个文件，则只插入一次）。
7. 使用 `apply_patch`（或等效的文件写入 API）写入两个文件变更：新增或覆盖 CSS 文件、更新 HTML 文件。
8. 验证：打开或读取更新后的 HTML，确认 `<link>` 存在且指向的 CSS 文件存在。

提示与注意
- 对于模板文件（例如含有 Mustache、EJS、Handlebars、Jinja 等），谨慎处理：若 `<style>` 中包含模板占位符，先提示用户。
- 若 HTML 中原本已有多个 `<link>`，保持新的 `<link>` 插入位置与原先 `<style>` 出现处一致，以保持层叠顺序。
- 如果 CSS 文件路径与已有资源冲突，建议询问用户是否覆盖或改名。

示例 agent 提示（供未来复用）
"请把 `popup.html` 中的所有 `<style>` 提取到 `popup.css`（放在同一目录），保留注释并用 `<link rel=\"stylesheet\" href=\"popup.css\">` 替换原 `<style>`。在执行前请显示将要应用的 `apply_patch` 补丁并等待确认。"

示例 `apply_patch` 模式（Agent 执行参考）
- Update File: path/to/popup.html — 用带 `<link>` 的内容替换 `<style>` 区块。
- Add File: path/to/popup.css — 新增包含提取样式的文件。

扩展
- 可增加 CLI 或脚本（如 Node.js 小脚本）实现批量扫描并在交互/非交互模式下运行。
- 可在 skill 中记录最近拆分操作（`.agent/history.md`），便于回滚或审计。

维护
- 当出现新的 HTML 模板语法或 edge case 时，更新该技能的检测与提示规则。

文件位置
- 存放路径：`.agent/split-css.instructions.md`（本文件）

结束。
