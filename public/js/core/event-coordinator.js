/**
 * TreeDB Event Coordinator
 * 事件协调器
 * 负责管理和协调组件间的事件通信
 */

import {
  LAYOUT_MIN_WIDTH,
  LAYOUT_MAX_WIDTH,
  CONTROL_PANEL_STORAGE_KEY,
  LAYOUT_STORAGE_KEY
} from '../utils/core.js';
import { setupLayoutResize, toggleControlPanel } from '../utils/utils.js';

/**
 * 事件协调器类
 * 单一职责：负责组件间的事件协调和通信
 */
export class EventCoordinator {
  constructor(services, components) {
    this.services = services;
    this.components = components;
    this.eventBus = services.stateManager.eventBus;
    this.eventListeners = new Map();
  }

  /**
   * 设置事件协调
   */
  async setup() {
    console.log('🔗 Setting up event coordination...');

    // 设置组件间事件监听
    this.setupComponentEvents();

    // 设置全局事件监听
    this.setupGlobalEvents();

    // 设置UI事件
    this.setupUIEvents();

    console.log('✅ Event coordination set up');
  }

  /**
   * 设置组件间事件监听
   * @private
   */
  setupComponentEvents() {
    // 树节点选择事件
    this.eventBus.on('nodeSelected', (nodeId) => {
      this.components.details.showDetails(nodeId);
      this.components.search.highlightNode(nodeId);
    });

    // 数据更新事件
    this.eventBus.on('dataUpdated', () => {
      this.components.tree.render();
      this.components.details.refresh();
    });

    // 配置保存事件
    this.eventBus.on('configSaved', (config) => {
      this.services.storage.set('lastConfig', config);
      this.eventBus.emit('dataUpdated');
    });

    // 搜索事件
    this.eventBus.on('searchPerformed', (results) => {
      this.components.tree.highlightSearchResults(results);
    });
  }

  /**
   * 设置全局事件监听
   * @private
   */
  setupGlobalEvents() {
    // 窗口大小改变事件
    const handleResize = () => {
      const width = window.innerWidth;
      this.services.stateManager.setState('layoutWidth', width);

      // 触发布局更新
      this.eventBus.emit('layoutChanged', { width });
    };

    window.addEventListener('resize', handleResize);
    this.addEventListener('window', 'resize', handleResize);

    // 在线/离线事件
    const handleOnline = () => {
      showToast('网络连接已恢复', 'success');
      this.eventBus.emit('online');
    };

    const handleOffline = () => {
      showToast('网络连接已断开', 'warning');
      this.eventBus.emit('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    this.addEventListener('window', 'online', handleOnline);
    this.addEventListener('window', 'offline', handleOffline);

    // 页面可见性改变事件
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.eventBus.emit('pageVisible');
      } else {
        this.eventBus.emit('pageHidden');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    this.addEventListener('document', 'visibilitychange', handleVisibilityChange);
  }

  /**
   * 设置UI事件
   * @private
   */
  setupUIEvents() {
    // 控制面板切换
    const controlPanelToggle = document.getElementById('toggle-control-panel');
    if (controlPanelToggle) {
      const handleToggle = () => {
        const collapsed = toggleControlPanel();
        this.services.storage.set(CONTROL_PANEL_STORAGE_KEY, collapsed);
        this.eventBus.emit('controlPanelToggled', { collapsed });
      };

      controlPanelToggle.addEventListener('click', handleToggle);
      this.addEventListener('controlPanelToggle', 'click', handleToggle);
    }

    // 布局调整
    const layoutResize = document.getElementById('layout-resize');
    if (layoutResize) {
      const { teardown: teardownResize } = setupLayoutResize(
        (width) => {
          this.services.stateManager.setState('layoutWidth', width);
          this.services.storage.set(LAYOUT_STORAGE_KEY, width);
          this.eventBus.emit('layoutResized', { width });
        }
      );

      // 保存清理函数
      this.layoutResizeCleanup = teardownResize;
    }

    // 主题切换
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      const handleThemeToggle = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        this.services.theme.setTheme(newTheme);
        this.services.storage.set('theme', newTheme);
        this.eventBus.emit('themeChanged', { theme: newTheme });
      };

      themeToggle.addEventListener('click', handleThemeToggle);
      this.addEventListener('themeToggle', 'click', handleThemeToggle);
    }

    // 快捷键
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcuts(e);
    });
    this.addEventListener('document', 'keydown', this.handleKeyboardShortcuts);
  }

  /**
   * 处理键盘快捷键
   * @private
   */
  handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + F: 聚焦搜索
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        searchInput.focus();
      }
    }

    // Ctrl/Cmd + S: 保存当前编辑
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (this.components.details.isEditMode) {
        this.components.details.saveEdit();
      }
    }

    // Escape: 退出编辑模式
    if (e.key === 'Escape') {
      if (this.components.details.isEditMode) {
        this.components.details.cancelEdit();
      }
    }

    // Ctrl/Cmd + N: 新建节点
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      const selectedNodeId = this.services.stateManager.getState('selectedNodeId');
      if (selectedNodeId) {
        this.components.details.addChildNode();
      } else {
        this.components.details.addRootNode();
      }
    }
  }

  /**
   * 添加事件监听器
   * @param {string} target - 目标对象标识
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  addEventListener(target, event, handler) {
    const key = `${target}:${event}`;
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, []);
    }
    this.eventListeners.get(key).push(handler);
  }

  /**
   * 移除事件监听器
   * @param {string} target - 目标对象标识
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  removeEventListener(target, event, handler) {
    const key = `${target}:${event}`;
    const listeners = this.eventListeners.get(key);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 清理所有事件监听器
   */
  cleanup() {
    console.log('🧹 Cleaning up event listeners...');

    // 清理布局调整
    if (this.layoutResizeCleanup) {
      this.layoutResizeCleanup();
    }

    // 清理所有事件监听器
    for (const [key, listeners] of this.eventListeners) {
      const [target, event] = key.split(':');

      if (target === 'window') {
        listeners.forEach(handler => {
          window.removeEventListener(event, handler);
        });
      } else if (target === 'document') {
        listeners.forEach(handler => {
          document.removeEventListener(event, handler);
        });
      } else {
        const element = document.getElementById(target);
        if (element) {
          listeners.forEach(handler => {
            element.removeEventListener(event, handler);
          });
        }
      }
    }

    this.eventListeners.clear();
    console.log('✅ Event listeners cleaned up');
  }

  /**
   * 销毁事件协调器
   */
  destroy() {
    this.cleanup();
    this.services = null;
    this.components = null;
    this.eventBus = null;
  }
}