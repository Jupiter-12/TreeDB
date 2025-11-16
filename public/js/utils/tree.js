/**
 * Tree Module - 树形结构模块
 * 负责树形结构的操作和算法
 * 单一职责：处理树形数据结构和操作
 */

/**
 * 获取节点的所有后代ID
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @returns {Array} - 后代ID数组
 */
export function getDescendantIds(data, nodeId) {
  const descendants = [];
  const node = data.find(n => n.id === nodeId);
  if (!node) return descendants;

  const children = data.filter(n => n.parent_id === nodeId);
  for (const child of children) {
    descendants.push(child.id);
    descendants.push(...getDescendantIds(data, child.id));
  }
  return descendants;
}

/**
 * 获取节点的所有祖先ID
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @returns {Array} - 祖先ID数组
 */
export function getAncestorIds(data, nodeId) {
  const ancestors = [];
  const visited = new Set();

  function findParent(id) {
    if (visited.has(id)) return;
    visited.add(id);

    const node = data.find(n => n.id === id);
    if (!node || !node.parent_id) return;

    ancestors.push(node.parent_id);
    findParent(node.parent_id);
  }

  findParent(nodeId);
  return ancestors;
}

/**
 * 获取节点的直接子节点
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @returns {Array} - 子节点数组
 */
export function getChildren(data, nodeId) {
  return data.filter(n => n.parent_id === nodeId);
}

/**
 * 获取节点的所有后代节点
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @returns {Array} - 后代节点数组
 */
export function getDescendants(data, nodeId) {
  const descendants = [];
  const nodeIds = getDescendantIds(data, nodeId);

  for (const id of nodeIds) {
    const node = data.find(n => n.id === id);
    if (node) descendants.push(node);
  }

  return descendants;
}

/**
 * 检查节点是否为另一个节点的后代
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @param {number|string} ancestorId - 祖先节点ID
 * @returns {boolean} - 是否为后代
 */
export function isDescendant(data, nodeId, ancestorId) {
  const ancestors = getAncestorIds(data, nodeId);
  return ancestors.includes(ancestorId);
}

/**
 * 获取根节点（没有父节点的节点）
 * @param {Array} data - 节点数据数组
 * @returns {Array} - 根节点数组
 */
export function getRootNodes(data) {
  return data.filter(n => !n.parent_id);
}

/**
 * 获取节点的深度
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 节点ID
 * @returns {number} - 深度
 */
export function getNodeDepth(data, nodeId) {
  return getAncestorIds(data, nodeId).length;
}

/**
 * 获取树的深度
 * @param {Array} data - 节点数据数组
 * @returns {number} - 树的深度
 */
export function getTreeDepth(data) {
  const rootNodes = getRootNodes(data);
  let maxDepth = 0;

  for (const root of rootNodes) {
    const depth = getSubtreeDepth(data, root.id);
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * 获取子树的深度
 * @private
 */
function getSubtreeDepth(data, nodeId, currentDepth = 0) {
  const children = getChildren(data, nodeId);
  if (children.length === 0) return currentDepth;

  let maxChildDepth = currentDepth;
  for (const child of children) {
    const depth = getSubtreeDepth(data, child.id, currentDepth + 1);
    maxChildDepth = Math.max(maxChildDepth, depth);
  }

  return maxChildDepth;
}

/**
 * 构建树形结构
 * @param {Array} data - 平铺的节点数据
 * @returns {Array} - 树形结构数据
 */
export function buildTree(data) {
  const nodeMap = new Map();
  const tree = [];

  // 创建节点映射
  for (const node of data) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  // 构建树形结构
  for (const [id, node] of nodeMap) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(node);
    } else {
      tree.push(node);
    }
  }

  return tree;
}

/**
 * 将树形结构平铺
 * @param {Array} tree - 树形结构数据
 * @returns {Array} - 平铺的节点数据
 */
export function flattenTree(tree, result = [], depth = 0) {
  for (const node of tree) {
    const flatNode = { ...node };
    delete flatNode.children;
    flatNode.depth = depth;
    result.push(flatNode);

    if (node.children && node.children.length > 0) {
      flattenTree(node.children, result, depth + 1);
    }
  }

  return result;
}

/**
 * 搜索树
 * @param {Array} data - 节点数据数组
 * @param {string} query - 搜索查询
 * @param {string} [field='name'] - 搜索字段
 * @returns {Array} - 匹配的节点数组
 */
export function searchTree(data, query, field = 'name') {
  if (!query) return [];

  const lowerQuery = query.toLowerCase();
  return data.filter(node => {
    const value = String(node[field] || '').toLowerCase();
    return value.includes(lowerQuery);
  });
}

/**
 * 过滤树（保留匹配节点及其祖先）
 * @param {Array} data - 节点数据数组
 * @param {Function} predicate - 过滤函数
 * @returns {Array} - 过滤后的节点数组
 */
export function filterTree(data, predicate) {
  const matched = new Set();
  const ancestors = new Set();

  // 找到匹配的节点
  for (const node of data) {
    if (predicate(node)) {
      matched.add(node.id);
    }
  }

  // 找到所有匹配节点的祖先
  for (const id of matched) {
    const nodeAncestors = getAncestorIds(data, id);
    nodeAncestors.forEach(aid => ancestors.add(aid));
  }

  // 过滤数据
  return data.filter(node =>
    matched.has(node.id) || ancestors.has(node.id)
  );
}

/**
 * 排序树节点
 * @param {Array} data - 节点数据数组
 * @param {string} [field='sort'] - 排序字段
 * @param {Function} [compareFn] - 比较函数
 * @returns {Array} - 排序后的节点数组
 */
export function sortTree(data, field = 'sort', compareFn) {
  const sorted = [...data];

  // 默认排序函数
  const defaultCompare = (a, b) => {
    const aVal = a[field] || 0;
    const bVal = b[field] || 0;
    return aVal - bVal;
  };

  const compare = compareFn || defaultCompare;

  // 对节点进行排序（确保父节点在子节点之前）
  return sorted.sort((a, b) => {
    // 如果是父子关系，保持父节点在前
    if (a.parent_id === b.id) return 1;
    if (b.parent_id === a.id) return -1;

    // 如果是兄弟节点，按字段排序
    if (a.parent_id === b.parent_id) {
      return compare(a, b);
    }

    // 否则按深度排序
    const depthA = getNodeDepth(data, a.id);
    const depthB = getNodeDepth(data, b.id);
    return depthA - depthB;
  });
}

/**
 * 移动节点
 * @param {Array} data - 节点数据数组
 * @param {number|string} nodeId - 要移动的节点ID
 * @param {number|string} newParentId - 新父节点ID
 * @param {number} [index] - 新位置索引
 * @returns {Array} - 更新后的数据
 */
export function moveNode(data, nodeId, newParentId, index) {
  // 检查是否会形成循环
  if (isDescendant(data, newParentId, nodeId)) {
    throw new Error('不能将节点移动到其后代节点下');
  }

  const newData = [...data];
  const nodeIndex = newData.findIndex(n => n.id === nodeId);

  if (nodeIndex === -1) {
    throw new Error('节点不存在');
  }

  // 更新父节点
  newData[nodeIndex].parent_id = newParentId;

  // 如果指定了索引，更新排序
  if (typeof index === 'number') {
    const siblings = newData.filter(n => n.parent_id === newParentId);
    const siblingCount = siblings.length;

    // 重新计算所有兄弟节点的排序值
    siblings.forEach((sibling, i) => {
      const sibIndex = newData.findIndex(n => n.id === sibling.id);
      if (sibIndex !== -1) {
        newData[sibIndex].sort = i * 10;
      }
    });

    // 设置移动节点的排序值
    const movedNodeIndex = newData.findIndex(n => n.id === nodeId);
    if (movedNodeIndex !== -1) {
      newData[movedNodeIndex].sort = index * 10;
    }
  }

  return newData;
}

/**
 * 验证树结构
 * @param {Array} data - 节点数据数组
 * @returns {Object} - 验证结果
 */
export function validateTree(data) {
  const errors = [];
  const warnings = [];
  const nodeIds = new Set();
  const parentIds = new Set();

  // 检查节点ID唯一性
  for (const node of data) {
    if (nodeIds.has(node.id)) {
      errors.push(`重复的节点ID: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (node.parent_id) {
      parentIds.add(node.parent_id);
    }
  }

  // 检查父节点是否存在
  for (const parentId of parentIds) {
    if (!nodeIds.has(parentId)) {
      warnings.push(`父节点不存在: ${parentId}`);
    }
  }

  // 检查循环引用
  for (const node of data) {
    if (node.parent_id) {
      if (isDescendant(data, node.parent_id, node.id)) {
        errors.push(`检测到循环引用: 节点 ${node.id} 是其自身祖先`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}