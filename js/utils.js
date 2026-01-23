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
/**
 * 解析标签字符串为数组（支持英文逗号和中文逗号）
 * @param {string|Array} tags - 标签字符串或数组
 * @returns {Array<string>} 标签数组
 */
export function parseTags(tags) {
  // 如果已经是数组，直接返回
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(t => t);
  }
  
  // 如果是字符串，解析它
  if (typeof tags === 'string') {
    const tagsString = tags.trim();
    if (!tagsString) {
      return [];
    }
    // 支持英文逗号和中文逗号分隔
    return tagsString.split(/[,，]/).map(t => t.trim()).filter(t => t);
  }
  
  return [];
}

/**
 * 将标签数组转换为字符串（用于存储）
 * @param {Array<string>|string} tags - 标签数组或字符串
 * @returns {string} 逗号分隔的标签字符串
 */
export function tagsArrayToString(tags) {
  if (Array.isArray(tags)) {
    return tags.map(t => String(t).trim()).filter(t => t).join(',');
  }
  if (typeof tags === 'string') {
    return tags.trim();
  }
  return '';
}

