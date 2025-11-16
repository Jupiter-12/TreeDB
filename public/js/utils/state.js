/**
 * State Module - ���态管理模块
 * 负责应用状态的创建和管理
 * 单一职责：管理应用状态
 */

import { DEFAULT_CONFIG } from './core.js';

/**
 * 创建空状态对象
 * @returns {Object} - 初始状态
 */
export function createEmptyState() {
  return {
    config: {},
    meta: {},
    data: [],
    selectedNodeId: null,
    foreignOptions: {},
    collapsed: {},
    sortDir: {},
    controlPanelCollapsed: false,
    isEditMode: false,
    editingField: null,
    editValue: null,
    originalValue: null,
    searchField: DEFAULT_CONFIG.nameField.value,
    searchQuery: '',
    searchResults: [],
    searchIndex: 0,
    searchTotal: 0,
    isSearchExpanded: false,
    draggedNodeId: null,
    draggedOverNodeId: null,
    draggedOverDirection: null,
    layoutWidth: 1024,
    isResizing: false,
    startX: 0,
    startWidth: 0
  };
}

/**
 * 创建空搜索状态
 * @returns {Object} - 搜索状态
 */
export function createEmptySearchState() {
  return {
    isSearchMode: false,
    searchField: DEFAULT_CONFIG.nameField.value,
    searchQuery: '',
    searchResults: [],
    searchIndex: 0,
    searchTotal: 0,
    isSearchExpanded: false
  };
}

/**
 * 状态管理类
 * 遵循单一职责原则：只管理状态
 */
export class StateManager {
  constructor(initialState = createEmptyState()) {
    this.state = initialState;
    this.listeners = new Map();
  }

  /**
   * 获取状态
   * @param {string} [path] - 状态路径（可选）
   * @returns {*} - 状态值
   */
  getState(path) {
    if (!path) return this.state;

    return path.split('.').reduce((obj, key) => {
      return obj && obj[key] !== undefined ? obj[key] : undefined;
    }, this.state);
  }

  /**
   * 更新状态
   * @param {string|Object} pathOrUpdates - 路径或更新对象
   * @param {*} [value] - 新值（当pathOrUpdates是路径时）
   */
  setState(pathOrUpdates, value) {
    if (typeof pathOrUpdates === 'string') {
      this.setNestedState(this.state, pathOrUpdates, value);
    } else if (typeof pathOrUpdates === 'object') {
      this.state = { ...this.state, ...pathOrUpdates };
    }

    this.notifyListeners();
  }

  /**
   * 设置嵌套状态
   * @private
   */
  setNestedState(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * 批量更新状态
   * @param {Function} updater - 更新函数
   */
  batchUpdate(updater) {
    const prevState = { ...this.state };
    updater(this.state);
    this.notifyListeners(prevState);
  }

  /**
   * 订阅状态变化
   * @param {Function} listener - 监听器函数
   * @returns {Function} - 取消订阅函数
   */
  subscribe(listener) {
    const id = Symbol('listener');
    this.listeners.set(id, listener);

    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * 通知所有监听器
   * @private
   */
  notifyListeners(prevState) {
    for (const listener of this.listeners.values()) {
      listener(this.state, prevState);
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.state = createEmptyState();
    this.notifyListeners();
  }
}