/**
 * TreeDB Main Application
 * 主应用程序入口
 * 遵循SOLID原则的优雅架构
 */

// ==================== Imports ====================
import { ApiClient } from './api/api.js';
import { StateManager, createEmptyState } from './utils/state.js';
import { SessionManager, withSession } from './utils/session.js';
import { ConfigManager } from './config/config.js';
import { ConfigFormController } from './config/config-form-controller.js';
import { TreeRenderer, DetailsRenderer, SearchController } from './ui/ui.js';
import { getDescendantIds } from './utils/tree.js';
import {
  initializeTheme,
  setupLayoutResize,
  toggleControlPanel,
  loadStoredControlPanelState,
  loadStoredLayoutWidth,
  setupTabSwitching,
  switchTab,
  eventBus
} from './utils/utils.js';
import { showToast } from './ui/toast.js';
import {
  LAYOUT_MIN_WIDTH,
  LAYOUT_MAX_WIDTH,
  CONTROL_PANEL_STORAGE_KEY,
  LAYOUT_STORAGE_KEY
} from './utils/core.js';

// ==================== Application Class ====================
/**
 * 主应用程序类
 * 遵循单一职责原则：负责应用程序的初始化和协调
 */
class TreeDBApp {
  constructor() {
    // 初始化核心组件
    this.api = new ApiClient();
    this.stateManager = new StateManager(createEmptyState());
    this.sessionManager = new SessionManager(this.api);
    this.configManager = new ConfigManager(this.api, this.sessionManager);

    // UI组件
    this.treeRenderer = null;
    this.detailsRenderer = null;
    this.searchController = null;
    this.configFormController = null;

    // 应用状态
    this.state = this.stateManager.getState();

    // 绑定方法上下文
    this.handleNodeSelected = this.handleNodeSelected.bind(this);
    this.handleDataUpdated = this.handleDataUpdated.bind(this);
    this.handleConfigSaved = this.handleConfigSaved.bind(this);
  }

  /**
   * 初始化应用程序
   */
  async initialize() {
    try {
      // 初始化主题
      initializeTheme();

      // 加载存储的状态
      await this.loadStoredState();

      // 初始化UI组件
      this.initializeUI();

      // 设置事件监听
      this.setupEventListeners();

      // 加载初始配置
      await this.loadInitialConfig();

      // 设置全局访问
      this.setupGlobalAccess();
    } catch (error) {
      console.error('Failed to initialize TreeDB:', error);
      showToast('应用程序初始化失败: ' + error.message, 'error');
    }
  }

  /**
   * 加载存储的状态
   * @private
   */
  async loadStoredState() {
    // 加载控制面板状态
    const controlPanelState = loadStoredControlPanelState();
    if (controlPanelState !== null) {
      this.stateManager.setState('controlPanelCollapsed', controlPanelState);
    }

    // 加载布局宽度
    const layoutWidth = loadStoredLayoutWidth();
    if (layoutWidth) {
      this.stateManager.setState('layoutWidth', layoutWidth);
    }

    // 清理遗留会话
    await this.sessionManager.cleanupLeftoverSession();
  }

  /**
   * 初始化UI组件
   * @private
   */
  initializeUI() {
    this.treeRenderer = new TreeRenderer(this.stateManager, this.api);
    this.detailsRenderer = new DetailsRenderer(this.stateManager, this.api);
    this.searchController = new SearchController(this.stateManager);
    this.configFormController = new ConfigFormController(this.api);

    // 设置布局调整
    setupLayoutResize(this.state);

    // 设置标签切换
    setupTabSwitching();

    // 设置控制面板切换
    this.setupControlPanelToggle();

    // 更新布局宽度
    if (this.state.layoutWidth !== 1024) {
      const treeContainer = document.getElementById('tree-container');
      const detailsContainer = document.getElementById('details-container');
      if (treeContainer) treeContainer.style.width = this.state.layoutWidth + 'px';
      if (detailsContainer) detailsContainer.style.left = this.state.layoutWidth + 'px';
    }

    // 更新控制面板状态
    if (this.state.controlPanelCollapsed) {
      const controlPanel = document.getElementById('control-panel');
      if (controlPanel) {
        controlPanel.classList.add('collapsed');
      }
    }
  }

  /**
   * 设置事件监听器
   * @private
   */
  setupEventListeners() {
    // 自定义事件监听
    window.addEventListener('nodeSelected', this.handleNodeSelected);
    window.addEventListener('selectNode', (e) => {
      if (this.treeRenderer) {
        this.treeRenderer.selectNode(e.detail.nodeId);
      }
    });
    window.addEventListener('dataUpdated', this.handleDataUpdated);
    window.addEventListener('configSaved', this.handleConfigSaved);
    window.addEventListener('configChanged', (e) => {
      console.log('configChanged event received via inline listener');
      this.handleConfigChanged(e);
    });

    // 状态管理器订阅
    this.stateManager.subscribe((newState, prevState) => {
      this.state = newState;
      this.handleStateChange(newState, prevState);
    });

    // 会话事件监听
    window.addEventListener('sessionExpired', () => {
      if (this.configFormController) {
        this.configFormController.showConfigDialog();
      }
    });

    // 全局事件总线监听
    eventBus.on('error', (error) => {
      showToast(error.message || '发生错误', 'error');
    });

    eventBus.on('success', (message) => {
      showToast(message, 'success');
    });

    // 控制面板切换
    const toggleControlPanelBtn = document.getElementById('toggle-control-panel');
    if (toggleControlPanelBtn) {
      toggleControlPanelBtn.addEventListener('click', () => {
        toggleControlPanel(this.state);
        this.stateManager.setState('controlPanelCollapsed', this.state.controlPanelCollapsed);
      });
    }

    // 菜单下拉功能
    this.setupMenuDropdowns();

    // 标签切换
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        switchTab(tabName);
      });
    });
  }

  /**
   * 设置菜单下拉功能
   * @private
   */
  setupMenuDropdowns() {
    const dropdowns = document.querySelectorAll('.menu-dropdown');

    dropdowns.forEach((dropdown) => {
      const button = dropdown.querySelector('button');
      const content = dropdown.querySelector('.menu-dropdown-content');

      if (!button || !content) {
        console.warn('Dropdown missing button or content:', dropdown);
        return;
      }

      // 确保初始状态是隐藏的
      content.style.display = 'none';

      // 切换下拉菜单
      button.addEventListener('click', (e) => {
        e.stopPropagation();

        // 关闭其他所有下拉菜单
        dropdowns.forEach(other => {
          if (other !== dropdown) {
            other.classList.remove('show');
            const otherContent = other.querySelector('.menu-dropdown-content');
            if (otherContent) {
              otherContent.style.display = 'none';
            }
          }
        });

        // 直接控制样式
        const content = dropdown.querySelector('.menu-dropdown-content');
        const isShowing = content.style.display === 'block';

        if (isShowing) {
          // 隐藏菜单
          content.style.display = 'none';
          dropdown.classList.remove('show');
        } else {
          // 显示菜单
          content.style.display = 'block';
          dropdown.classList.add('show');
        }
      });

      // 点击菜单项时关闭下拉菜单
      const menuItems = content.querySelectorAll('.menu-item');
      menuItems.forEach(item => {
        item.addEventListener('click', () => {
          dropdown.classList.remove('show');
        });
      });
    });

    // 点击页面其他地方时关闭所有下拉菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.menu-dropdown')) {
        dropdowns.forEach(dropdown => {
          dropdown.classList.remove('show');
          const content = dropdown.querySelector('.menu-dropdown-content');
          if (content) {
            content.style.display = 'none';
          }
        });
      }
    });
  }

  /**
   * 处理节点选择
   * @private
   */
  handleNodeSelected(event) {
    const { nodeId } = event.detail;
    this.stateManager.setState('selectedNodeId', nodeId);

    if (this.detailsRenderer) {
      this.detailsRenderer.render();
    }
  }

  /**
   * 处理数据更新
   * @private
   */
  handleDataUpdated() {
    if (this.treeRenderer) {
      this.treeRenderer.render();
    }
    if (this.detailsRenderer) {
      this.detailsRenderer.render();
    }
  }

  /**
   * 处理配置变更
   * @private
   */
  handleConfigChanged() {
    console.log('Config changed event received');
    // 配置变更后重新加载数据
    // 尝试从多个地方获取会话ID
    let sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) {
      // 如果sessionManager中没有，直接从localStorage读取
      sessionId = localStorage.getItem('treedb.activeSessionId');
      console.log('Session ID from localStorage:', sessionId);
    }
    console.log('Current session ID:', sessionId);
    if (sessionId) {
      this.loadData();
    } else {
      console.warn('No active session to load data');
    }
  }

  /**
   * 设置控制面板切换
   * @private
   */
  setupControlPanelToggle() {
    const controlPanelMode = document.getElementById('controlPanelMode');
    const configPanel = document.getElementById('configPanel');
    const searchPanel = document.getElementById('searchPanel');

    if (controlPanelMode && configPanel && searchPanel) {
      controlPanelMode.addEventListener('change', (e) => {
        const mode = e.target.value;

        if (mode === 'config') {
          configPanel.hidden = false;
          searchPanel.hidden = true;
        } else if (mode === 'search') {
          configPanel.hidden = true;
          searchPanel.hidden = false;
          // 当切换到搜索面板时，重新初始化搜索控制器
          if (this.searchController) {
            setTimeout(() => {
              this.searchController.init();
            }, 0);
          }
        }
      });

      // 初始化显示配置面板
      if (controlPanelMode.value === 'config') {
        searchPanel.hidden = true;
      } else {
        configPanel.hidden = true;
        // 如果初始是搜索模式，初始化搜索控制器
        if (this.searchController) {
          setTimeout(() => {
            this.searchController.init();
          }, 0);
        }
      }
    }
  }

  /**
   * 处理配置保存
   * @private
   */
  async handleConfigSaved(event) {
    const { config } = event.detail;
    this.stateManager.setState('config', config);

    // 加载数据
    await this.loadData();
  }

  /**
   * 处理状态变化
   * @private
   */
  handleStateChange(newState, prevState) {
    // 处理关键状态变化
    if (prevState && newState.selectedNodeId !== prevState.selectedNodeId) {
      eventBus.emit('nodeSelectionChanged', {
        oldId: prevState.selectedNodeId,
        newId: newState.selectedNodeId
      });
    }

    if (prevState && newState.data !== prevState.data) {
      eventBus.emit('dataChanged', {
        oldData: prevState.data,
        newData: newState.data
      });
    }
  }

  /**
   * 加载初始配置
   * @private
   */
  async loadInitialConfig() {
    const config = await this.configManager.loadInitialConfig();

    if (config) {
      this.stateManager.setState('config', config);

      // 如果有活动会话，加载数据
      if (this.sessionManager.getCurrentSessionId()) {
        await this.loadData();
      }
    } else {
      // 显示配置对话框
      if (this.configFormController) {
        this.configFormController.showConfigDialog();
      }
    }
  }

  /**
   * 加载数据
   * @private
   */
  async loadData() {
    console.log('loadData called');
    if (!this.sessionManager.getCurrentSessionId()) {
      console.warn('No active session, skipping data load');
      return;
    }

    try {
      console.log('Fetching nodes and meta...');
      const [nodes, meta] = await Promise.all([
        this.api.getNodes(),
        this.api.getMeta()
      ]);

      console.log('Loaded nodes:', nodes);
      console.log('Loaded meta:', meta);

      // 更新状态
      this.stateManager.batchUpdate((state) => {
        state.data = nodes || [];
        state.meta = meta || {};
      });

      // 加载外键选项
      if (meta.fields) {
        await this.loadForeignOptions(meta.fields);
      }

      // 渲染树形结构
      if (this.treeRenderer) {
        console.log('Rendering tree with', nodes.length, 'nodes');
        this.treeRenderer.render();
      } else {
        console.error('TreeRenderer not initialized');
      }

    } catch (error) {
      console.error('Failed to load data:', error);
      showToast('加载数据失败: ' + error.message, 'error');
    }
  }

  /**
   * 加载外键选项
   * @private
   */
  async loadForeignOptions(fields) {
    const foreignFields = fields.filter(f => f.foreignKey);

    for (const field of foreignFields) {
      try {
        const options = await this.api.getForeignOptions(field.name);
        this.stateManager.setState(`foreignOptions.${field.name}`, options);
      } catch (e) {
        console.warn(`Failed to load foreign options for ${field.name}:`, e);
      }
    }
  }

  /**
   * 设置全局访问
   * @private
   */
  setupGlobalAccess() {
    // 导出到全局作用域，便于HTML中的内联事件处理器访问
    window.treedb = {
      app: this,
      api: this.api,
      stateManager: this.stateManager,
      sessionManager: this.sessionManager,
      configManager: this.configManager,
      get state() { return this.state; },
      get activeSessionId() { return this.sessionManager.getCurrentSessionId(); },

      // 工具函数
      getDescendantIds,
      showToast,
      withSession: (operation, ...args) => withSession(this.sessionManager, operation, ...args),

      // UI操作
      selectNode: (nodeId) => {
        if (this.treeRenderer) {
          this.treeRenderer.selectNode(nodeId);
        }
      },

      // 渲染器访问
      get detailsRenderer() { return this.detailsRenderer; },
      get treeRenderer() { return this.treeRenderer; },
      get searchController() { return this.searchController; }
    };
  }

  /**
   * 销毁应用程序
   */
  destroy() {
    // 清理事件监听器
    window.removeEventListener('nodeSelected', this.handleNodeSelected);
    window.removeEventListener('dataUpdated', this.handleDataUpdated);
    window.removeEventListener('configSaved', this.handleConfigSaved);

    // 清理事件总线
    eventBus.clear();

    // 释放会话
    this.sessionManager.deleteSession();

    console.log('TreeDB destroyed');
  }
}

// ==================== Application Bootstrap ====================
/**
 * 应用程序引导
 */
async function bootstrap() {
  // 创建应用实例
  const app = new TreeDBApp();

  // 初始化应用
  await app.initialize();

  // 全局应用实例（用于调试）
  window.TreeDBApp = app;

  // 返回应用实例
  return app;
}

// 当DOM加载完成后启动应用
document.addEventListener('DOMContentLoaded', bootstrap);

// 导出应用类（用于测试）
export { TreeDBApp };