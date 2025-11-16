/**
 * UI Module - 用户界面模块
 * 负责UI交互和渲染
 * 单一职责：处理用户界面相关功能
 */

import { showModal, showConfirmation } from '../utils/utils.js';
import { showToast, showSuccess, showError, showWarning, showInfo } from './toast.js';
import { escapeHtml } from '../utils/core.js';

/**
 * 树形渲染器
 * 遵循单一职���原则：只负责树形结构的渲染
 */
export class TreeRenderer {
  constructor(stateManager, api) {
    this.stateManager = stateManager;
    this.api = api;
  }

  /**
   * 获取当前状态
   * @private
   */
  get state() {
    return this.stateManager.getState();
  }

  /**
   * 构建树形结构（非递归）
   * @private
   */
  buildForest(data) {
    const nodes = new Map();
    const roots = [];
    const orphans = [];

    // 第一遍：创建所有节点
    data.forEach(row => {
      const id = row.id;
      nodes.set(id, { data: row, children: [] });
    });

    // 第二遍：构建父子关系
    nodes.forEach(node => {
      const nodeId = node.data.id;
      const parentId = node.data.parent_id;

      if (parentId === null || parentId === undefined || parentId === '' || parentId === nodeId) {
        // 没有父节点或者是自己的父节点（循环引用）
        roots.push(node);
      } else {
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // 父节点不存在，作为孤儿节点
          orphans.push(node);
        }
      }
    });

    return { roots, orphans };
  }

  /**
   * 渲染单个节点
   * @private
   */
  renderTreeNode(node, depth = 0) {
    const nodeId = node.data.id;
    const isSelected = this.state.selectedNodeId === nodeId;
    const isCollapsed = this.state.collapsed[nodeId];
    const hasChildren = node.children.length > 0;
    const indent = depth * 20;

    const li = document.createElement('li');
    li.className = 'tree-node';
    li.dataset.id = nodeId;
    li.dataset.depth = depth;

    const label = document.createElement('div');
    label.className = `tree-node-content ${isSelected ? 'selected' : ''}`;
    // 不再使用缩进，子节点直接在父节点下方显示
    label.dataset.nodeId = nodeId;

    // 折叠/展开按钮 - 根节点不缩进，子节点适度缩进
    if (hasChildren) {
      const toggle = document.createElement('button');
      toggle.className = `tree-toggle ${isCollapsed ? 'collapsed' : ''}`;
      toggle.textContent = isCollapsed ? '+' : '-';
      toggle.title = '展开 / 折叠';
      // 根节点（depth=0）不缩进，子节点缩进10px
      toggle.style.marginLeft = depth > 0 ? `${10 + (depth - 1) * 15}px` : '0';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse(nodeId);
      });
      label.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-spacer';
      // 根节点（depth=0）不缩进，子节点缩进10px
      spacer.style.marginLeft = depth > 0 ? `${10 + (depth - 1) * 15}px` : '0';
      label.appendChild(spacer);
    }

    // 节点文本
    const text = document.createElement('span');
    text.className = 'tree-node-text';
    // 尝试多个可能的名称字段
    const nameValue = node.data[this.state.config.nameField?.value] ||
                      node.data['name'] ||
                      node.data['Name'] ||
                      node.data['title'] ||
                      node.data['Title'] ||
                      `ID: ${node.data.id || node.data[this.state.config?.idField || 'id']}`;
    text.textContent = nameValue;
    label.appendChild(text);

    li.appendChild(label);

    // 子节点
    if (hasChildren && !isCollapsed) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';

      node.children.forEach(child => {
        const childElement = this.renderTreeNode(child, depth + 1);
        childrenContainer.appendChild(childElement);
      });

      li.appendChild(childrenContainer);
    }

    return li;
  }

  /**
   * 切换节点的折叠/展开状态
   * @private
   */
  toggleCollapse(nodeId) {
    const currentCollapsed = this.state.collapsed || {};
    const newCollapsed = { ...currentCollapsed };

    if (newCollapsed[nodeId]) {
      delete newCollapsed[nodeId];
    } else {
      newCollapsed[nodeId] = true;
    }

    this.stateManager.setState('collapsed', newCollapsed);
    this.render(); // 重新渲染
  }

  /**
   * 选择节点
   * @param {number} nodeId - 节点ID
   */
  selectNode(nodeId) {
    this.stateManager.setState('selectedNodeId', nodeId);
    this.render();

    // 触发选择事件
    window.dispatchEvent(new CustomEvent('nodeSelected', {
      detail: { nodeId }
    }));
  }

  /**
   * 渲染树形结构
   */
  render() {
    const treeContainer = document.getElementById('treeContainer');
    if (!treeContainer) return;

    if (!this.state.data || this.state.data.length === 0) {
      treeContainer.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }

    // 构建森林
    const { roots, orphans } = this.buildForest(this.state.data);

    // 清空容器
    treeContainer.innerHTML = '';

    // 渲染主树
    const treeRoot = document.createElement('ul');
    treeRoot.className = 'tree-root';

    roots.forEach(node => {
      const rendered = this.renderTreeNode(node);
      treeRoot.appendChild(rendered);
    });
    treeContainer.appendChild(treeRoot);

    // 渲染孤儿节点（如果有的话）
    if (orphans.length > 0) {
      const orphanSection = document.createElement('div');
      orphanSection.className = 'tree-orphans';
      orphanSection.innerHTML = `
        <h3>未找到上级的节点</h3>
        <p style="color: var(--color-text-muted); font-size: 12px; margin-bottom: 10px;">
          以下节点的父节点不存在，可能是数据不一致导致的：
        </p>
      `;

      const orphanList = document.createElement('ul');
      orphans.forEach(node => {
        const rendered = this.renderTreeNode(node);
        orphanList.appendChild(rendered);
      });
      orphanSection.appendChild(orphanList);
      treeContainer.appendChild(orphanSection);
    }

    this.bindEvents();
  }

  /**
   * 绑定事件
   * @private
   */
  bindEvents() {
    // 节点选择
    document.querySelectorAll('.tree-node-content').forEach(node => {
      node.addEventListener('click', (e) => {
        if (e.target.classList.contains('tree-toggle')) return;
        const nodeId = parseInt(node.parentElement.dataset.id);
        this.selectNode(nodeId);
      });
    });

    // 折叠切换
    document.querySelectorAll('.tree-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const nodeId = parseInt(toggle.dataset.id);
        this.toggleCollapse(nodeId);
      });
    });
  }

  /**
   * 选择节点
   * @param {number} nodeId - 节点ID
   */
  selectNode(nodeId) {
    this.state.selectedNodeId = nodeId;
    this.render();

    // 触发自定义事件
    window.dispatchEvent(new CustomEvent('nodeSelected', { detail: { nodeId } }));
  }

  /**
   * 切换折叠状态
   * @param {number} nodeId - 节点ID
   */
  toggleCollapse(nodeId) {
    this.state.collapsed[nodeId] = !this.state.collapsed[nodeId];
    this.render();
  }
}

/**
 * 详情渲染器
 */
export class DetailsRenderer {
  constructor(stateManager, api) {
    this.stateManager = stateManager;
    this.api = api;
  }

  /**
   * 获取当前状态
   * @private
   */
  get state() {
    return this.stateManager.getState();
  }

  /**
   * 渲染详情
   */
  render() {
    const detailsContainer = document.getElementById('details-content');
    if (!detailsContainer) return;

    if (!this.state.selectedNodeId) {
      detailsContainer.innerHTML = '<div class="empty-state">请选择一个节点</div>';
      return;
    }

    const node = this.state.data.find(n => n.id === this.state.selectedNodeId);
    if (!node) {
      detailsContainer.innerHTML = '<div class="error">节点不存在</div>';
      return;
    }

    const fields = this.state.meta.fields || [];
    const detailsHtml = fields.map(field => {
      const value = node[field.name];
      const isEditing = this.state.isEditMode && this.state.editingField === field.name;

      return `
        <div class="detail-field">
          <label class="detail-label">${field.comment || field.name}:</label>
          <div class="detail-value">
            ${isEditing ? this.renderFieldEditor(field, value) : this.renderFieldValue(field, value)}
          </div>
        </div>
      `;
    }).join('');

    detailsContainer.innerHTML = `
      <div class="details-header">
        <h3>节点详情</h3>
        <div class="details-actions">
          ${this.state.isEditMode ? `
            <button onclick="detailsRenderer.saveEdit()" class="btn btn-primary">保存</button>
            <button onclick="detailsRenderer.cancelEdit()" class="btn btn-secondary">取消</button>
          ` : `
            <button onclick="detailsRenderer.startEdit()" class="btn btn-primary">编辑</button>
            <button onclick="detailsRenderer.deleteNode()" class="btn btn-danger">删除</button>
          `}
        </div>
      </div>
      ${detailsHtml}
    `;
  }

  /**
   * 渲染字段值
   * @private
   */
  renderFieldValue(field, value) {
    if (value === null || value === undefined) return '<span class="null-value">NULL</span>';

    if (field.type === 'boolean') {
      return value ? '<span class="boolean-true">TRUE</span>' : '<span class="boolean-false">FALSE</span>';
    }

    const TEXTAREA_TYPES = ['text', 'longtext', 'mediumtext'];
    if (TEXTAREA_TYPES.includes(field.type.toLowerCase())) {
      return `<pre class="text-value">${escapeHtml(value)}</pre>`;
    }

    return `<span class="value">${escapeHtml(value)}</span>`;
  }

  /**
   * 渲染字段编辑器
   * @private
   */
  renderFieldEditor(field, value) {
    const fieldId = `edit-${field.name}`;
    const TEXTAREA_TYPES = ['text', 'longtext', 'mediumtext'];

    if (field.type === 'boolean') {
      return `
        <input type="checkbox" id="${fieldId}" ${value ? 'checked' : ''}
               onchange="detailsRenderer.updateEditValue('${field.name}', this.checked)">
      `;
    }

    if (TEXTAREA_TYPES.includes(field.type.toLowerCase())) {
      return `
        <textarea id="${fieldId}" rows="4"
                  onchange="detailsRenderer.updateEditValue('${field.name}', this.value)">${escapeHtml(value || '')}</textarea>
      `;
    }

    // 外键引用
    if (field.foreignKey && this.state.foreignOptions[field.name]) {
      const options = this.state.foreignOptions[field.name];
      return `
        <select id="${fieldId}" onchange="detailsRenderer.updateEditValue('${field.name}', this.value)">
          <option value="">请选择...</option>
          ${options.map(opt =>
            `<option value="${opt.value}" ${opt.value == value ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
      `;
    }

    return `
      <input type="${field.type === 'password' ? 'password' : 'text'}"
             id="${fieldId}" value="${escapeHtml(value || '')}"
             onchange="detailsRenderer.updateEditValue('${field.name}', this.value)">
    `;
  }

  
  /**
   * 开始编辑
   */
  startEdit() {
    this.stateManager.setState('isEditMode', true);
    this.render();
  }

  /**
   * 取消编辑
   */
  cancelEdit() {
    this.stateManager.batchUpdate((state) => {
      state.isEditMode = false;
      state.editingField = null;
      state.editValue = null;
      state.originalValue = null;
    });
    this.render();
  }

  /**
   * 更新编辑值
   * @param {string} fieldName - 字段名
   * @param {*} value - 值
   */
  updateEditValue(fieldName, value) {
    this.stateManager.batchUpdate((state) => {
      state.editValue = value;
      state.editingField = fieldName;
    });
  }

  /**
   * 保存编辑
   */
  async saveEdit() {
    if (!this.state.editingField || this.state.selectedNodeId === null) return;

    try {
      const updateData = {};
      updateData[this.state.editingField] = this.state.editValue;
      await this.api.updateNode(this.state.selectedNodeId, updateData);

      // 更新本地数据
      const newData = this.state.data.map(n => {
        if (n.id === this.state.selectedNodeId) {
          return { ...n, [this.state.editingField]: this.state.editValue };
        }
        return n;
      });

      this.stateManager.setState('data', newData);

      showToast('保存成功', 'success');
      this.stateManager.batchUpdate((state) => {
        state.isEditMode = false;
        state.editingField = null;
      });
      this.render();

      // 触发树形更新
      window.dispatchEvent(new CustomEvent('dataUpdated'));
    } catch (error) {
      showToast('保存失败: ' + error.message, 'error');
    }
  }

  /**
   * 删除节点
   */
  async deleteNode() {
    if (!this.state.selectedNodeId) return;

    if (!showConfirmation('确定要删除此节点及其所有子节点吗？')) return;

    try {
      const { getDescendantIds } = await import('../utils/tree.js');
      const descendants = getDescendantIds(this.state.data, this.state.selectedNodeId);
      await this.api.deleteNode(this.state.selectedNodeId);

      // 从本地数据中移除
      const newData = this.state.data.filter(n =>
        n.id !== this.state.selectedNodeId && !descendants.includes(n.id)
      );

      this.stateManager.batchUpdate((state) => {
        state.data = newData;
        state.selectedNodeId = null;
      });

      showToast('删除成功', 'success');

      // 触发树形更新
      window.dispatchEvent(new CustomEvent('dataUpdated'));
      this.render();
    } catch (error) {
      showToast('删除失败: ' + error.message, 'error');
    }
  }
}

/**
 * 搜索控制器
 */
export class SearchController {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.init();
  }

  /**
   * 获取当前状态
   * @private
   */
  get state() {
    return this.stateManager.getState();
  }

  /**
   * 初始化搜索
   */
  init() {
    // 清除之前的事件监听器
    const searchInput = document.getElementById('treeSearch');
    const clearSearch = document.getElementById('clearTreeSearch');
    const searchResults = document.getElementById('searchResults');

    // 使用简单的防抖实现
    let searchTimeout;
    const debouncedSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.handleSearch();
      }, 300);
    };

    if (searchInput) {
      // 移除旧的监听器
      searchInput.removeEventListener('input', debouncedSearch);
      // 添加新的监听器
      searchInput.addEventListener('input', debouncedSearch);
    }

    if (clearSearch) {
      clearSearch.removeEventListener('click', this.clearResults.bind(this));
      clearSearch.addEventListener('click', () => this.clearResults());
    }

    // 导航按钮
    const prevButton = document.getElementById('treeSearchPrev');
    const nextButton = document.getElementById('treeSearchNext');
    if (prevButton) {
      prevButton.removeEventListener('click', () => this.navigate('prev'));
      prevButton.addEventListener('click', () => this.navigate('prev'));
    }
    if (nextButton) {
      nextButton.removeEventListener('click', () => this.navigate('next'));
      nextButton.addEventListener('click', () => this.navigate('next'));
    }
  }

  /**
   * 处理搜索
   */
  handleSearch() {
    const searchInput = document.getElementById('treeSearch');

    if (!searchInput) return;

    const query = searchInput.value.trim();

    this.stateManager.setState('searchQuery', query);
    this.stateManager.setState('searchField', 'Name'); // 默认搜索Name字段

    if (!query) {
      this.clearResults();
      return;
    }

    this.perform();
  }

  /**
   * 执行搜索
   */
  perform() {
    if (!this.state.searchQuery) return;

    // 确保有数据可搜索
    if (!this.state.data || this.state.data.length === 0) {
      showToast('没有可搜索的数据', 'warning');
      return;
    }

    const query = this.state.searchQuery.toLowerCase();
    const searchFields = ['Name', 'name', 'Introduce', 'introduce', 'Website', 'website', 'Tutorial', 'tutorial'];

    const results = this.state.data.filter(node => {
      // 搜索多个字段
      return searchFields.some(field => {
        const value = String(node[field] || '').toLowerCase();
        return value.includes(query);
      });
    }).map(node => {
      // 计算匹配得分，用于排序
      let score = 0;
      let matchedField = '';

      searchFields.forEach(field => {
        const value = String(node[field] || '').toLowerCase();
        if (value === query) {
          score = 100; // 完全匹配
          matchedField = field;
        } else if (value.startsWith(query)) {
          score = 80; // 开头匹配
          matchedField = field;
        } else if (value.includes(query)) {
          score = 60; // 包含匹配
          if (!matchedField) matchedField = field;
        }
      });

      return { ...node, _searchScore: score, _matchedField: matchedField };
    }).sort((a, b) => b._searchScore - a._searchScore);

    this.stateManager.batchUpdate((state) => {
      state.searchResults = results;
      state.searchIndex = 0;
      state.searchTotal = results.length;
    });

    this.renderResults();

    if (results.length > 0) {
      // 触发节点选择
      window.dispatchEvent(new CustomEvent('selectNode', { detail: { nodeId: results[0].id } }));
      showToast(`找到 ${results.length} 个结果`, 'info');
    } else {
      showToast('未找到匹配的节点', 'warning');
    }
  }

  /**
   * 渲染搜索结果
   */
  renderResults() {
    const searchInfo = document.getElementById('treeSearchInfo');
    const prevButton = document.getElementById('treeSearchPrev');
    const nextButton = document.getElementById('treeSearchNext');
    const clearButton = document.getElementById('clearTreeSearch');
    const searchInput = document.getElementById('treeSearch');

    if (searchInfo) {
      if (this.state.searchTotal > 0) {
        searchInfo.textContent = `${this.state.searchIndex + 1} / ${this.state.searchTotal}`;
      } else {
        searchInfo.textContent = '';
      }
    }

    if (prevButton) prevButton.disabled = this.state.searchIndex <= 0;
    if (nextButton) nextButton.disabled = this.state.searchIndex >= this.state.searchTotal - 1;
    if (clearButton) clearButton.disabled = this.state.searchResults.length === 0;

    // 渲染搜索结果列表
    this.renderSearchList();
  }

  /**
   * 渲染搜索结果列表
   */
  renderSearchList() {
    const searchResultsContainer = document.getElementById('searchResults');
    if (!searchResultsContainer) return;

    if (this.state.searchResults.length === 0) {
      searchResultsContainer.innerHTML = '';
      return;
    }

    const resultsHtml = this.state.searchResults.map((node, index) => {
      const isSelected = index === this.state.searchIndex;
      const name = node.Name || node.name || node.title || `ID: ${node.id}`;
      return `
        <div class="search-result-item ${isSelected ? 'selected' : ''}" data-index="${index}">
          <span class="result-name">${escapeHtml(name)}</span>
          <span class="result-id">ID: ${node.id}</span>
        </div>
      `;
    }).join('');

    searchResultsContainer.innerHTML = resultsHtml;

    // 添加点击事件
    searchResultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.stateManager.setState('searchIndex', index);
        this.renderResults();
        const nodeId = this.state.searchResults[index].id;
        window.dispatchEvent(new CustomEvent('selectNode', { detail: { nodeId } }));
      });
    });
  }

  
  /**
   * 导航搜索结果
   * @param {string} direction - 方向：prev 或 next
   */
  navigate(direction) {
    if (this.state.searchResults.length === 0) return;

    let newIndex = this.state.searchIndex;
    if (direction === 'prev' && newIndex > 0) {
      newIndex--;
    } else if (direction === 'next' && newIndex < this.state.searchResults.length - 1) {
      newIndex++;
    }

    this.stateManager.setState('searchIndex', newIndex);

    const nodeId = this.state.searchResults[newIndex].id;
    window.dispatchEvent(new CustomEvent('selectNode', { detail: { nodeId } }));
    this.renderResults();
  }

  /**
   * 清除搜索结果
   */
  clearResults() {
    this.stateManager.batchUpdate((state) => {
      state.searchQuery = '';
      state.searchResults = [];
      state.searchIndex = 0;
      state.searchTotal = 0;
    });

    const searchInput = document.getElementById('treeSearch');
    if (searchInput) searchInput.value = '';

    // 清除搜索结果显示
    const searchResultsContainer = document.getElementById('searchResults');
    if (searchResultsContainer) searchResultsContainer.innerHTML = '';

    // 更新搜索信息显示
    this.renderResults();
  }
}