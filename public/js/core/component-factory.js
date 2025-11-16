/**
 * TreeDB Component Factory
 * 组件工厂类
 * 负责创建和配置UI组件
 */

import { TreeRenderer } from '../ui/tree-renderer.js';
import { DetailsRenderer } from '../ui/details-renderer.js';
import { SearchController } from '../ui/search-controller.js';
import { ConfigFormController } from '../config/config.js';

/**
 * 组件工厂类
 * 单一职责：负责创建和配置UI组件实例
 */
export class ComponentFactory {
  constructor(services) {
    this.services = services;
    this.componentConfigs = this.getDefaultConfigs();
  }

  /**
   * 获取默认组件配置
   * @private
   */
  getDefaultConfigs() {
    return {
      tree: {
        containerSelector: '#tree',
        expandIcon: '▶',
        collapseIcon: '▼',
        dragIcon: '⋮⋮'
      },
      details: {
        containerSelector: '#details-content',
        formSelector: '#edit-form'
      },
      search: {
        inputSelector: '#search-input',
        resultsSelector: '#search-results'
      },
      config: {
        formSelector: '#config-form'
      }
    };
  }

  /**
   * 创建树形渲染器
   * @returns {TreeRenderer} 树形渲染器实例
   */
  createTreeRenderer() {
    const config = this.componentConfigs.tree;
    const renderer = new TreeRenderer(
      this.services.stateManager,
      config.containerSelector,
      config
    );

    // 注入依赖
    renderer.api = this.services.api;
    renderer.eventBus = this.services.stateManager.eventBus;

    return renderer;
  }

  /**
   * 创建详情渲染器
   * @returns {DetailsRenderer} 详情渲染器实例
   */
  createDetailsRenderer() {
    const config = this.componentConfigs.details;
    const renderer = new DetailsRenderer(
      this.services.stateManager,
      config.containerSelector,
      config.formSelector
    );

    // 注入依赖
    renderer.api = this.services.api;
    renderer.eventBus = this.services.stateManager.eventBus;

    return renderer;
  }

  /**
   * 创建搜索控制器
   * @returns {SearchController} 搜索控制器实例
   */
  createSearchController() {
    const config = this.componentConfigs.search;
    const controller = new SearchController(
      this.services.stateManager,
      config.inputSelector,
      config.resultsSelector
    );

    // 注入依赖
    renderer.api = this.services.api;
    renderer.eventBus = this.services.stateManager.eventBus;

    return controller;
  }

  /**
   * 创建配置表单控制器
   * @returns {ConfigFormController} 配置表单控制器实例
   */
  createConfigFormController() {
    const config = this.componentConfigs.config;
    const controller = new ConfigFormController(
      this.services.configManager,
      config.formSelector
    );

    return controller;
  }

  /**
   * 批量创建所有组件
   * @returns {Object} 包含所有组件的对象
   */
  createAllComponents() {
    return {
      tree: this.createTreeRenderer(),
      details: this.createDetailsRenderer(),
      search: this.createSearchController(),
      config: this.createConfigFormController()
    };
  }

  /**
   * 更新组件配置
   * @param {string} componentName - 组件名称
   * @param {Object} config - 新的配置
   */
  updateConfig(componentName, config) {
    if (this.componentConfigs[componentName]) {
      this.componentConfigs[componentName] = {
        ...this.componentConfigs[componentName],
        ...config
      };
    }
  }

  /**
   * 获取组件配置
   * @param {string} componentName - 组件名称
   * @returns {Object} 组件配置
   */
  getConfig(componentName) {
    return this.componentConfigs[componentName] || {};
  }
}