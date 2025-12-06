/**
 * 工具函数模块
 * 提供通用的工具函数，如状态显示、日志记录等
 */

/**
 * 显示状态消息
 * @param {HTMLElement} statusElement - 状态消息元素
 * @param {string} message - 要显示的消息
 * @param {boolean} isError - 是否为错误消息
 */
export function showStatus(statusElement, message, isError = false) {
  statusElement.textContent = message;
  statusElement.style.display = 'block';
  
  if (isError) {
    statusElement.classList.add('error-message');
  } else {
    statusElement.classList.remove('error-message');
  }
  
  // 自动隐藏（非错误消息）
  if (!isError) {
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }
}

/**
 * 添加日志
 * @param {HTMLElement} debugPanel - 调试面板元素
 * @param {string} message - 日志消息
 */
export function log(debugPanel, message) {
  const timestamp = new Date().toLocaleTimeString();
  debugPanel.textContent += `\n[${timestamp}] ${message}`;
  debugPanel.scrollTop = debugPanel.scrollHeight;
  console.log(message);
}

/**
 * 格式化日期
 * @param {string} timestamp - ISO 格式的时间戳
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 解析标签字符串
 * @param {string} tagsString - 标签字符串（逗号分隔）
 * @returns {string[]} 标签数组
 */
export function parseTags(tagsString) {
  if (!tagsString || tagsString.trim() === '') {
    return [];
  }
  return tagsString.split(',').map(t => t.trim()).filter(t => t);
}

