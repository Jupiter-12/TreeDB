/**
 * API Module - API模块
 * 负责与后端的所有通信
 * 单一职责：处理HTTP请求和响应
 */

import {
  API_ENDPOINT,
  META_ENDPOINT,
  FOREIGN_ENDPOINT_BASE,
  RESTORE_ENDPOINT,
  SORT_REBUILD_ENDPOINT,
  CONFIG_ENDPOINT,
  CONFIG_DB_FILES_ENDPOINT,
  CONFIG_TABLES_ENDPOINT,
  SESSION_ENDPOINT
} from './core.js';

/**
 * API客户端类
 * 遵循单一职责原则：只负责API通信
 */
export class ApiClient {
  constructor() {
    this.sessionId = null;
  }

  /**
   * 设置会话ID
   * @param {string} sessionId - 会话ID
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
  }

  /**
   * 添加会话参数到URL
   * @param {string} url - 原始URL
   * @returns {string} - 带会话参数的URL
   */
  addSessionParam(url) {
    if (this.sessionId) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}session=${encodeURIComponent(this.sessionId)}`;
    }
    return url;
  }

  /**
   * 通用请求方法
   * @param {string} url - 请求URL
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} - 响应数据
   */
  async request(url, options = {}) {
    const fullUrl = this.addSessionParam(url);
    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // ==================== Node Operations ====================

  /**
   * 获取所有节点
   * @returns {Promise<Array>} - 节点数组
   */
  async getNodes() {
    return this.request(API_ENDPOINT);
  }

  /**
   * 创建节点
   * @param {Object} data - 节点数据
   * @returns {Promise<Object>} - 创建的节点
   */
  async createNode(data) {
    return this.request(API_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  /**
   * 更新节点
   * @param {number|string} id - 节点ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} - 更新后的节点
   */
  async updateNode(id, data) {
    return this.request(`${API_ENDPOINT}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * 删除节点
   * @param {number|string} id - 节点ID
   * @returns {Promise<void>}
   */
  async deleteNode(id) {
    return this.request(`${API_ENDPOINT}/${id}`, {
      method: 'DELETE'
    });
  }

  /**
   * 恢复节点
   * @param {Array} nodes - 要恢复的节点数组
   * @returns {Promise<Object>} - 恢复结果
   */
  async restoreNodes(nodes) {
    return this.request(RESTORE_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({ nodes })
    });
  }

  /**
   * 重建排序
   * @returns {Promise<Object>} - 排序结果
   */
  async sortRebuild() {
    return this.request(SORT_REBUILD_ENDPOINT, {
      method: 'POST'
    });
  }

  // ==================== Metadata Operations ====================

  /**
   * 获取元数据
   * @returns {Promise<Object>} - 元数据对象
   */
  async getMeta() {
    return this.request(META_ENDPOINT);
  }

  /**
   * 获取外键选项
   * @param {string} column - 列名
   * @returns {Promise<Array>} - 选项数组
   */
  async getForeignOptions(column) {
    return this.request(`${FOREIGN_ENDPOINT_BASE}${encodeURIComponent(column)}`);
  }

  // ==================== Configuration Operations ====================

  /**
   * 获取配置
   * @returns {Promise<Object>} - 配置对象
   */
  async getConfig() {
    return this.request(CONFIG_ENDPOINT);
  }

  /**
   * 更新配置
   * @param {Object} config - 配置对象
   * @returns {Promise<Object>} - 更新后的配置
   */
  async updateConfig(config) {
    return this.request(CONFIG_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  /**
   * 获取数据库文件列表
   * @returns {Promise<Array>} - 文件列表
   */
  async getDbFiles() {
    return this.request(CONFIG_DB_FILES_ENDPOINT);
  }

  /**
   * 获取表列表
   * @param {Object} dbConfig - 数据库配置
   * @returns {Promise<Array>} - 表列表
   */
  async getTables(dbConfig) {
    const params = new URLSearchParams({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    });
    return this.request(`${CONFIG_TABLES_ENDPOINT}?${params}`);
  }

  // ==================== Session Operations ====================

  /**
   * 创建会话
   * @param {Object} config - 会话配置
   * @returns {Promise<Object>} - 会话信息
   */
  async createSession(config) {
    return this.request(SESSION_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  /**
   * 更新会话
   * @param {Object} config - 会话配置
   * @returns {Promise<Object>} - 更新后的会话信息
   */
  async updateSession(config) {
    return this.request(SESSION_ENDPOINT, {
      method: 'PUT',
      body: JSON.stringify(config)
    });
  }

  /**
   * 删除会话
   * @returns {Promise<Object>} - 删除结果
   */
  async deleteSession() {
    if (!this.sessionId) {
      throw new Error('No session to delete');
    }
    return this.request(`${SESSION_ENDPOINT}?session=${encodeURIComponent(this.sessionId)}`, {
      method: 'DELETE'
    });
  }
}