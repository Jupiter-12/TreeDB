/**
 * UI Module - 用户界面模块
 * 负责UI交互和渲染
 * 单一职责：处理用户界面相关功能
 */

import { showToast, showModal, showConfirmation } from '../utils/utils.js';

/**
 * 树形渲染器
 * 遵循单一职���原则：只负责树形结构的渲染
 */
export class TreeRenderer {
  constructor(state, api) {
    this.state = state;
    this.api = api;
  }

  /**
   * 渲染树形结构
   */
  render() {
    const treeContainer = document.getElementById('tree');
    if (!treeContainer) return;

    if (!this.state.data || this.state.data.length === 0) {
      treeContainer.innerHTML = '<div class="empty-state">暂无数据</div>';
      return;
    }

    const rootNodes = this.state.data.filter(node => !node.parent_id);
    const treeHtml = rootNodes.map(node => this.renderNode(node, 0)).join('');
    treeContainer.innerHTML = treeHtml;

    this.bindEvents();
  }

  /**
   * 渲染单个节点
   * @private
   */
  renderNode(node, depth) {
    const hasChildren = this.state.data.some(n => n.parent_id === node.id);
    const isCollapsed = this.state.collapsed[node.id];
    const isSelected = this.state.selectedNodeId === node.id;
    const indent = depth * 20;

    return `
      <div class="tree-node" data-id="${node.id}" data-depth="${depth}">
        <div class="tree-node-content ${isSelected ? 'selected' : ''}" style="padding-left: ${indent}px">
          ${hasChildren ? `
            <button class="tree-toggle ${isCollapsed ? 'collapsed' : ''}" data-id="${node.id}">
              ${isCollapsed ? '▶' : '▼'}
            </button>
          ` : '<span class="tree-spacer"></span>'}
          <span class="tree-node-text">${node[this.state.config.nameField?.value || 'name'] || '未命名'}</span>
        </div>
        ${hasChildren && !isCollapsed ? `
          <div class="tree-children">
            ${this.state.data.filter(n => n.parent_id === node.id)
              .map(child => this.renderNode(child, depth + 1)).join('')}
          </div>
        ` : ''}
      </div>
    `;
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
  constructor(state, api) {
    this.state = state;
    this.api = api;
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
      return `<pre class="text-value">${this.escapeHtml(value)}</pre>`;
    }

    return `<span class="value">${this.escapeHtml(value)}</span>`;
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
                  onchange="detailsRenderer.updateEditValue('${field.name}', this.value)">${this.escapeHtml(value || '')}</textarea>
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
             id="${fieldId}" value="${this.escapeHtml(value || '')}"
             onchange="detailsRenderer.updateEditValue('${field.name}', this.value)">
    `;
  }

  /**
   * HTML转义
   * @private
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 开始编辑
   */
  startEdit() {
    this.state.isEditMode = true;
    this.render();
  }

  /**
   * 取消编辑
   */
  cancelEdit() {
    this.state.isEditMode = false;
    this.state.editingField = null;
    this.state.editValue = null;
    this.state.originalValue = null;
    this.render();
  }

  /**
   * 更新编辑值
   * @param {string} fieldName - 字段名
   * @param {*} value - 值
   */
  updateEditValue(fieldName, value) {
    this.state.editValue = value;
    this.state.editingField = fieldName;
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
      const node = this.state.data.find(n => n.id === this.state.selectedNodeId);
      if (node) {
        node[this.state.editingField] = this.state.editValue;
      }

      showToast('保存成功', 'success');
      this.state.isEditMode = false;
      this.state.editingField = null;
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
      this.state.data = this.state.data.filter(n =>
        n.id !== this.state.selectedNodeId && !descendants.includes(n.id)
      );
      this.state.selectedNodeId = null;

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
  constructor(state) {
    this.state = state;
    this.init();
  }

  /**
   * 初始化搜索
   */
  init() {
    const searchInput = document.getElementById('search-input');
    const searchField = document.getElementById('search-field');
    const clearSearch = document.getElementById('clear-search');

    if (searchInput) {
      import('./core.js').then(({ debounce }) => {
        searchInput.addEventListener('input', debounce(() => this.handleSearch(), 300));
      });
    }

    if (searchField) {
      searchField.addEventListener('change', () => this.handleSearch());
    }

    if (clearSearch) {
      clearSearch.addEventListener('click', () => this.clearResults());
    }

    // 导航按钮
    const prevButton = document.getElementById('search-prev');
    const nextButton = document.getElementById('search-next');
    if (prevButton) prevButton.addEventListener('click', () => this.navigate('prev'));
    if (nextButton) nextButton.addEventListener('click', () => this.navigate('next'));
  }

  /**
   * 处理搜索
   */
  handleSearch() {
    const searchInput = document.getElementById('search-input');
    const searchField = document.getElementById('search-field');

    if (!searchInput || !searchField) return;

    const query = searchInput.value.trim();
    const field = searchField.value;

    this.state.searchQuery = query;
    this.state.searchField = field;

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

    const results = this.state.data.filter(node => {
      const value = String(node[this.state.searchField] || '').toLowerCase();
      return value.includes(this.state.searchQuery.toLowerCase());
    });

    this.state.searchResults = results;
    this.state.searchIndex = 0;
    this.state.searchTotal = results.length;

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
    const searchInfo = document.getElementById('search-info');
    const prevButton = document.getElementById('search-prev');
    const nextButton = document.getElementById('search-next');

    if (searchInfo) {
      if (this.state.searchTotal > 0) {
        searchInfo.textContent = `${this.state.searchIndex + 1} / ${this.state.searchTotal}`;
      } else {
        searchInfo.textContent = '';
      }
    }

    if (prevButton) prevButton.disabled = this.state.searchIndex <= 0;
    if (nextButton) nextButton.disabled = this.state.searchIndex >= this.state.searchTotal - 1;
  }

  /**
   * 导航搜索结果
   * @param {string} direction - 方向：prev 或 next
   */
  navigate(direction) {
    if (this.state.searchResults.length === 0) return;

    if (direction === 'prev' && this.state.searchIndex > 0) {
      this.state.searchIndex--;
    } else if (direction === 'next' && this.state.searchIndex < this.state.searchResults.length - 1) {
      this.state.searchIndex++;
    }

    const nodeId = this.state.searchResults[this.state.searchIndex].id;
    window.dispatchEvent(new CustomEvent('selectNode', { detail: { nodeId } }));
    this.renderResults();
  }

  /**
   * 清除搜索结果
   */
  clearResults() {
    this.state.searchQuery = '';
    this.state.searchResults = [];
    this.state.searchIndex = 0;
    this.state.searchTotal = 0;

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    this.renderResults();
  }
}