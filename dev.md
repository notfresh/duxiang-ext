# 图片制作
https://docsmall.com/image-resize


# 查看日志

查看控制台日志的重要提示
要查看弹出窗口的控制台日志：
在扩展的弹出窗口中右键点击，选择"检查"（或按F12键）
这将打开开发者工具，切换到"控制台"标签查看日志
如果您在主浏览器的控制台中查看，是看不到弹出窗口中的日志的。
提示：您也可以在Chrome扩展管理页面（chrome://extensions/）中找到您的扩展，点击"背景页"链接来查看background.js的日志。

# 错误
当哪里不对劲的时候，需要看console.log

## 修复 Content Security Policy 错误

您遇到的错误是Chrome扩展的内容安全策略(CSP)限制导致的。默认情况下，扩展不允许使用内联脚本，必须将JavaScript代码放在单独的文件中。

## 解决方案：

1. 创建一个单独的JavaScript文件`popup.js`
2. 将内联脚本移到这个文件中
3. 在popup.html中通过`<script src="popup.js"></script>`引用它

## 说明

1. 创建了新的`popup.js`文件，包含所有之前的JavaScript逻辑
2. 修改了`popup.html`，移除了内联脚本标签，替换为引用外部JavaScript文件
3. 保留了所有原有功能和样式

这样修改后，您的扩展应该能够正常工作，同时符合Chrome扩展的内容安全策略。


