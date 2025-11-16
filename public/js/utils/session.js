/**
 * Session Module - 会话管理模块
 * 负责会话的创建、维护和清理
 * 单一职责：处理用户会话相关功能
 */

import { showToast } from './utils.js';

/**
 * 会话管理器
 * 遵循单一职责原则：只负责会话管理
 */
export class SessionManager {
  constructor(api) {
    this.api = api;
    this.sessionId = null;
    this.isAutoReleaseEnabled = true;

    // 尝试从localStorage恢复会话ID
    this.restoreSession();

    this.setupEventHandlers();
  }

  /**
   * 获取当前会话ID
   * @returns {string|null}
   */
  getCurrentSessionId() {
    return this.sessionId;
  }

  /**
   * 恢复会话
   * @private
   */
  restoreSession() {
    const lastSessionId = localStorage.getItem('treedb.activeSessionId');
    if (lastSessionId) {
      // 检查会话是否仍然有效（通过API调用验证）
      this.validateAndRestoreSession(lastSessionId);
    }
  }

  /**
   * 验证并恢复会话
   * @param {string} sessionId - 会话ID
   * @private
   */
  async validateAndRestoreSession(sessionId) {
    try {
      // 尝试获取会话信息来验证其有效性
      const response = await fetch(`/api/session?session=${encodeURIComponent(sessionId)}`);
      if (response.ok) {
        const sessions = await response.json();
        const currentSession = sessions.find(s => s.id === sessionId);
        if (currentSession) {
          this.setSessionId(sessionId);
          // 触发会话恢复事件
          window.dispatchEvent(new CustomEvent('sessionRestored', {
            detail: { sessionId }
          }));
        } else {
          // 会话不存在，清理存储
          localStorage.removeItem('treedb.activeSessionId');
        }
      } else {
        // 会话无效，清理存储
        localStorage.removeItem('treedb.activeSessionId');
      }
    } catch (error) {
      console.warn('Failed to validate session:', error);
      // 网络错误或其他问题，先尝试恢复，后续请求会验证
      this.setSessionId(sessionId);
    }
  }

  /**
   * 设置会话ID
   * @param {string} sessionId - 会话ID
   */
  setSessionId(sessionId) {
    this.sessionId = sessionId;
    this.api.setSessionId(sessionId);

    // 保存到localStorage
    if (sessionId) {
      localStorage.setItem('treedb.activeSessionId', sessionId);
    } else {
      localStorage.removeItem('treedb.activeSessionId');
    }

    // 触发会话变更事件
    window.dispatchEvent(new CustomEvent('sessionChanged', {
      detail: { sessionId, isActive: !!sessionId }
    }));
  }

  /**
   * 创建会话
   * @param {Object} config - 会话配置
   * @param {boolean} [force=false] - 是否强制创建
   * @returns {Promise<Object>} - 会话信息
   */
  async createSession(config, force = false) {
    try {
      const sessionConfig = { ...config };
      if (force) {
        sessionConfig.force = true;
      }

      const response = await this.api.createSession(sessionConfig);
      this.setSessionId(response.sessionId);

      return response;
    } catch (error) {
      if (error.message.includes('正在被其他会话使用')) {
        throw new SessionConflictError(error.message);
      }
      throw error;
    }
  }

  /**
   * 更新会话
   * @param {Object} config - 新的会话配置
   * @param {boolean} [force=false] - 是否强制更新
   * @returns {Promise<Object>} - 更新结果
   */
  async updateSession(config, force = false) {
    if (!this.sessionId) {
      throw new Error('没有活动的会话');
    }

    try {
      const sessionConfig = { ...config };
      if (force) {
        sessionConfig.force = true;
      }

      const response = await this.api.updateSession(sessionConfig);
      return response;
    } catch (error) {
      if (error.message.includes('正在被其他会话使用')) {
        throw new SessionConflictError(error.message);
      }
      throw error;
    }
  }

  /**
   * 删除会话
   * @returns {Promise<Object>} - 删除结果
   */
  async deleteSession() {
    if (!this.sessionId) {
      return;
    }

    try {
      await this.api.deleteSession();
      this.cleanup();
    } catch (error) {
      console.warn('Failed to delete session:', error);
      // 即使删除失败也要清理本地状态
      this.cleanup();
    }
  }

  /**
   * 检查会话是否有效
   * @returns {Promise<boolean>} - 是否有效
   */
  async validateSession() {
    if (!this.sessionId) {
      return false;
    }

    try {
      await this.api.getMeta();
      return true;
    } catch (error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        this.handleSessionExpired();
        return false;
      }
      throw error;
    }
  }

  /**
   * 处理会话过期
   */
  handleSessionExpired() {
    showToast('会话已过期，请重新配置', 'warning');
    this.cleanup();

    // 显示配置对话框
    const configDialog = document.getElementById('config-dialog');
    if (configDialog) {
      configDialog.style.display = 'flex';
    }

    // 触发会话过期事件
    window.dispatchEvent(new CustomEvent('sessionExpired'));
  }

  /**
   * 设置事件处理器
   * @private
   */
  setupEventHandlers() {
    // 页面卸载时自动释放会话
    const handlePageUnload = () => {
      if (this.isAutoReleaseEnabled && this.sessionId) {
        this.saveSessionForCleanup();
        this.attemptSessionRelease();
      }
    };

    // 页面隐藏时保存会话信息（移动端优化）
    const handleVisibilityChange = () => {
      if (document.hidden && this.sessionId) {
        this.saveSessionForCleanup();
      }
    };

    // 注册事件监听器
    window.addEventListener('beforeunload', handlePageUnload);
    window.addEventListener('pagehide', handlePageUnload);
    window.addEventListener('unload', handlePageUnload);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    // 页面加载时清理遗留会话
    this.cleanupLeftoverSession();
  }

  /**
   * 保存会话信息用于清理
   * @private
   */
  saveSessionForCleanup() {
    try {
      localStorage.setItem('treedb.lastSessionId', this.sessionId);
      localStorage.setItem('treedb.lastSessionTime', Date.now().toString());
    } catch (e) {
      // 忽略存储错误
    }
  }

  /**
   * 尝试释放会话
   * @private
   */
  attemptSessionRelease() {
    const url = `/api/session?session=${encodeURIComponent(this.sessionId)}`;

    // 使用 fetch with keepalive
    try {
      fetch(url, {
        method: 'DELETE',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {
        // 失败时使用 sendBeacon 作为后备
        try {
          const data = new Blob(JSON.stringify({}), {
            type: 'application/json'
          });
          navigator.sendBeacon(url, data);
        } catch (e) {
          // 最后的后备方案：存储在 localStorage
          localStorage.setItem('treedb.pendingRelease', this.sessionId);
        }
      });
    } catch (e) {
      // fetch 不可用，使用 sendBeacon
      try {
        const data = new Blob();
        navigator.sendBeacon(url, data);
      } catch (beaconError) {
        localStorage.setItem('treedb.pendingRelease', this.sessionId);
      }
    }
  }

  /**
   * 清理遗留会话
   * @private
   */
  async cleanupLeftoverSession() {
    const lastSessionId = localStorage.getItem('treedb.lastSessionId');
    const lastSessionTime = localStorage.getItem('treedb.lastSessionTime');

    if (!lastSessionId) return;

    // 检查会话时间（超过5分钟的会话视为过期）
    const now = Date.now();
    const sessionAge = now - parseInt(lastSessionTime || '0');
    const maxAge = 5 * 60 * 1000; // 5分钟

    if (sessionAge > maxAge) {
      localStorage.removeItem('treedb.lastSessionId');
      localStorage.removeItem('treedb.lastSessionTime');
      return;
    }

    try {
      // 尝试释放遗留会话
      await fetch(`/api/session?session=${encodeURIComponent(lastSessionId)}`, {
        method: 'DELETE',
        keepalive: true
      });
    } catch (e) {
      console.warn('Failed to cleanup leftover session:', e);
    } finally {
      // 清理存储
      localStorage.removeItem('treedb.lastSessionId');
      localStorage.removeItem('treedb.lastSessionTime');
    }

    // 处理待释放的会话
    const pendingRelease = localStorage.getItem('treedb.pendingRelease');
    if (pendingRelease) {
      try {
        await fetch(`/api/session?session=${encodeURIComponent(pendingRelease)}`, {
          method: 'DELETE',
          keepalive: true
        });
      } catch (e) {
        console.warn('Failed to release pending session:', e);
      } finally {
        localStorage.removeItem('treedb.pendingRelease');
      }
    }
  }

  /**
   * 清理会话
   * @private
   */
  cleanup() {
    this.sessionId = null;
    this.api.setSessionId(null);

    // 清理本地存储
    try {
      localStorage.removeItem('treedb.activeSessionId');
      localStorage.removeItem('treedb.lastSessionId');
      localStorage.removeItem('treedb.lastSessionTime');
    } catch (e) {
      // 忽略
    }

    // 触发会话结束事件
    window.dispatchEvent(new CustomEvent('sessionEnded'));
  }

  /**
   * 启用/禁用自动释放
   * @param {boolean} enabled - 是否启用
   */
  setAutoRelease(enabled) {
    this.isAutoReleaseEnabled = enabled;
  }

  /**
   * 强制刷新页面确认
   * @returns {boolean} - 是否确认
   */
  confirmPageRefresh() {
    if (!this.sessionId) return true;

    return confirm('您有未保存的会话，确定要离开吗？');
  }
}

/**
 * 会话冲突错误
 */
export class SessionConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionConflictError';
    this.code = 'SESSION_CONFLICT';
  }
}

/**
 * 会话包装器 - 自动处理会话验证
 * @param {SessionManager} sessionManager - 会话管理器
 * @param {Function} operation - 要执行的操作
 * @param {...*} args - 操作参数
 * @returns {Promise<*>} - 操作结果
 */
export async function withSession(sessionManager, operation, ...args) {
  if (!sessionManager.getCurrentSessionId()) {
    showToast('请先配置数据库连接', 'error');
    return;
  }

  try {
    return await operation(...args);
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('403')) {
      sessionManager.handleSessionExpired();
    } else {
      throw error;
    }
  }
}