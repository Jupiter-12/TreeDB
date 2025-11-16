/**
 * TreeDB Application Bootstrap
 * 应用程序启动引导类
 * 负责应用程序的初始化流程
 */

import { ApiClient } from '../api/api.js';
import { StateManager, createEmptyState } from '../utils/state.js';
import { SessionManager } from '../utils/session.js';
import { ConfigManager } from '../config/config.js';
import { ComponentFactory } from './component-factory.js';
import { EventCoordinator } from './event-coordinator.js';
import { ThemeManager } from '../utils/theme.js';
import { StorageManager } from '../utils/storage.js';
import { showToast } from '../utils/utils.js';

/**
 * 应用程序启动引导类
 * 单一职责：负���应用程序的启动和初始化流程
 */
export class ApplicationBootstrap {
  constructor() {
    this.services = {};
    this.components = {};
    this.isInitialized = false;
  }

  /**
   * 初始化应用程序
   * 按照正确的顺序初始化各个组件
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('Application already initialized');
      return;
    }

    try {
      console.log('🚀 Starting TreeDB initialization...');

      // 第一阶段：初始化核心服务
      await this.initializeServices();

      // 第二阶段：初始化主题
      await this.initializeTheme();

      // 第三阶段：加载存储的状态
      await this.loadStoredState();

      // 第四阶段：创建UI组件
      await this.createComponents();

      // 第五阶段：设置事件协调
      await this.setupEventCoordination();

      // 第六阶段：加载初始数据
      await this.loadInitialData();

      // 第七阶段：设置全局访问
      this.setupGlobalAccess();

      this.isInitialized = true;
      console.log('✅ TreeDB initialization completed');

    } catch (error) {
      console.error('❌ Failed to initialize TreeDB:', error);
      showToast('应用程序初始化失败: ' + error.message, 'error');
      throw error;
    }
  }

  /**
   * 初始化核心服务
   * @private
   */
  async initializeServices() {
    console.log('📦 Initializing core services...');

    // 创建核心服务实例
    this.services.api = new ApiClient();
    this.services.stateManager = new StateManager(createEmptyState());
    this.services.sessionManager = new SessionManager(this.services.api);
    this.services.configManager = new ConfigManager(
      this.services.api,
      this.services.sessionManager
    );
    this.services.storage = new StorageManager();
    this.services.theme = new ThemeManager();

    console.log('✅ Core services initialized');
  }

  /**
   * 初始化主题
   * @private
   */
  async initializeTheme() {
    console.log('🎨 Initializing theme...');
    await this.services.theme.initialize();
    console.log('✅ Theme initialized');
  }

  /**
   * 加载存储的状态
   * @private
   */
  async loadStoredState() {
    console.log('💾 Loading stored state...');

    // 加载控制面板状态
    const controlPanelState = await this.services.storage.get('controlPanelCollapsed');
    if (controlPanelState !== null) {
      this.services.stateManager.setState('controlPanelCollapsed', controlPanelState);
    }

    // 加载布局宽度
    const layoutWidth = await this.services.storage.get('layoutWidth');
    if (layoutWidth) {
      this.services.stateManager.setState('layoutWidth', layoutWidth);
    }

    console.log('✅ Stored state loaded');
  }

  /**
   * 创建UI组件
   * @private
   */
  async createComponents() {
    console.log('🧩 Creating UI components...');

    const factory = new ComponentFactory(this.services);

    // 创建核心UI组件
    this.components.tree = factory.createTreeRenderer();
    this.components.details = factory.createDetailsRenderer();
    this.components.search = factory.createSearchController();
    this.components.config = factory.createConfigFormController();

    // 初始化所有组件
    for (const [name, component] of Object.entries(this.components)) {
      if (component.initialize) {
        await component.initialize();
      }
    }

    console.log('✅ UI components created');
  }

  /**
   * 设置事件协调
   * @private
   */
  async setupEventCoordination() {
    console.log('🔗 Setting up event coordination...');

    this.eventCoordinator = new EventCoordinator(
      this.services,
      this.components
    );

    await this.eventCoordinator.setup();

    console.log('✅ Event coordination set up');
  }

  /**
   * 加载初始数据
   * @private
   */
  async loadInitialData() {
    console.log('📊 Loading initial data...');

    // 尝试加载保存的配置
    const savedConfig = await this.services.storage.get('lastConfig');
    if (savedConfig) {
      try {
        await this.services.configManager.applyConfig(savedConfig);
        console.log('✅ Saved configuration loaded');
      } catch (error) {
        console.warn('⚠️ Failed to load saved config:', error);
      }
    }

    console.log('✅ Initial data loaded');
  }

  /**
   * 设置全局访问
   * @private
   */
  setupGlobalAccess() {
    // 将核心服务暴露到全局，方便调试
    if (typeof window !== 'undefined') {
      window.treedb = {
        services: this.services,
        components: this.components,
        eventBus: this.eventCoordinator?.eventBus,
        state: this.services.stateManager.getState()
      };
    }
  }

  /**
   * 获取服务实例
   * @param {string} name - 服务名称
   * @returns {*} 服务实例
   */
  getService(name) {
    return this.services[name];
  }

  /**
   * 获取组件实例
   * @param {string} name - 组件名称
   * @returns {*} 组件实例
   */
  getComponent(name) {
    return this.components[name];
  }

  /**
   * 销毁应用程序
   */
  async destroy() {
    console.log('🗑️ Destroying TreeDB application...');

    // 清理组件
    for (const component of Object.values(this.components)) {
      if (component.destroy) {
        await component.destroy();
      }
    }

    // 清理服务
    for (const service of Object.values(this.services)) {
      if (service.destroy) {
        await service.destroy();
      }
    }

    // 清理全局引用
    if (typeof window !== 'undefined' && window.treedb) {
      delete window.treedb;
    }

    this.isInitialized = false;
    console.log('✅ Application destroyed');
  }
}