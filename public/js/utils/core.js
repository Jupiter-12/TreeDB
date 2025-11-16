/**
 * Core Module - 核心模块
 * 负责基础配置、常量和工具函数
 * 单一职责：提供应用核心功能
 */

// ==================== Constants ====================
export const API_ENDPOINT = '/api/nodes';
export const META_ENDPOINT = '/api/meta';
export const FOREIGN_ENDPOINT_BASE = '/api/foreign/';
export const RESTORE_ENDPOINT = '/api/restore';
export const SORT_REBUILD_ENDPOINT = '/api/sort-rebuild';
export const CONFIG_ENDPOINT = '/api/config';
export const CONFIG_DB_FILES_ENDPOINT = '/api/config/db-files';
export const CONFIG_TABLES_ENDPOINT = '/api/config/tables';
export const SESSION_ENDPOINT = '/api/session';
export const LOADING_SENTINEL = '__loading__';

export const DEFAULT_CONFIG = {
  host: { value: 'localhost', label: '主机', type: 'text' },
  user: { value: '', label: '用户名', type: 'text' },
  password: { value: '', label: '密码', type: 'password' },
  database: { value: '', label: '数据库', type: 'text' },
  table: { value: '', label: '表名', type: 'text' },
  idField: { value: 'id', label: 'ID字段', type: 'text' },
  parentField: { value: 'parent_id', label: '父级ID字段', type: 'text' },
  nameField: { value: 'name', label: '名称字段', type: 'text' },
  sortField: { value: 'sort', label: '排序字段', type: 'text' },
  collapsed: { value: 'false', label: '折叠状态', type: 'checkbox' }
};

export const THEME_STORAGE_KEY = 'treedb-theme';
export const CONTROL_PANEL_STORAGE_KEY = 'treedbControlPanelCollapsed';
export const LAYOUT_MIN_WIDTH = 800;
export const LAYOUT_MAX_WIDTH = 1200;
export const LAYOUT_STORAGE_KEY = 'treedb-layout-width';
export const NUMERIC_TYPES = ['integer', 'int', 'smallint', 'bigint', 'decimal', 'numeric', 'real', 'float', 'double'];
export const BOOLEAN_TYPES = ['boolean', 'bool', 'tinyint(1)'];
export const TEXTAREA_TYPES = ['text', 'longtext', 'mediumtext'];

// ==================== Utility Functions ====================
/**
 * 确保值是字符串
 * @param {*} value - 要转换的值
 * @returns {string}
 */
export function ensureString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * 转换为布尔值
 * @param {*} value - 要转换的值
 * @returns {boolean}
 */
export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === 1 || value === '1';
}

/**
 * 创建字段ID
 * @param {string} prefix - 前缀
 * @param {string} fieldName - 字段名
 * @returns {string}
 */
export function makeFieldId(prefix, fieldName) {
  return `${prefix}-${fieldName}`;
}

/**
 * 规范化配置快照
 * @param {Object} config - 配置对象
 * @returns {Object}
 */
export function normalizeConfigSnapshot(config) {
  const normalized = {};
  for (const [key, field] of Object.entries(config)) {
    if (field && typeof field === 'object' && 'value' in field) {
      normalized[key] = field.value;
    }
  }
  return normalized;
}

/**
 * 检查是否有有意义的配置数据
 * @param {Object} config - 配置对象
 * @returns {boolean}
 */
export function hasMeaningfulConfigData(config) {
  if (!config || typeof config !== 'object') return false;
  const meaningfulFields = ['database', 'table', 'idField', 'parentField', 'nameField'];
  return meaningfulFields.some(key => config[key] && config[key].value);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * HTML转义
 * @param {string} text - 要转义的文本
 * @returns {string}
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== Storage Utilities ====================
/**
 * 安全的localStorage获取
 * @param {string} key - 键
 * @param {*} defaultValue - 默认值
 * @returns {*}
 */
export function safeLocalStorageGet(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? item : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 安全的localStorage设置
 * @param {string} key - 键
 * @param {*} value - 值
 * @returns {boolean}
 */
export function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 安全的sessionStorage获取
 * @param {string} key - 键
 * @param {*} defaultValue - 默认值
 * @returns {*}
 */
export function safeSessionStorageGet(key, defaultValue = null) {
  try {
    const item = sessionStorage.getItem(key);
    return item !== null ? item : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}