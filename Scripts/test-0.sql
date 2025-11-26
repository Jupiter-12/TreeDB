-- 方案2：临时表+临时列
-- 第 1 步：创建临时表（或新表）保存 id 和新排序值
DROP TABLE IF EXISTS tmp_tool_sort;
CREATE TEMP TABLE IF NOT EXISTS tmp_tool_sort (
  id INTEGER PRIMARY KEY,
  new_sort_order INTEGER
);

-- 第 2 步:清空临时表(如果之前有数据)
DELETE FROM tmp_tool_sort;

-- 第 3 步:将原表内容带上排序号逻辑插入临时表
-- 使用与方案1相同的公式: (ROW_NUMBER() - 2) * 1000,从 -1000 开始
INSERT INTO tmp_tool_sort (id, new_sort_order)
SELECT
  id,
  (ROW_NUMBER() OVER (ORDER BY "sort_order") - 2) * 1000 AS new_sort_order
FROM tool;

-- 第 4 步:用临时表里的 new_sort_order 更新原表（分两阶段）
WITH params AS (
    SELECT COALESCE(MAX(ABS(new_sort_order)), 0) + 1000 AS base_width
    FROM tmp_tool_sort
)
UPDATE tool
SET "sort_order" = -(
    SELECT tmp.new_sort_order * params.base_width + tool.id
    FROM tmp_tool_sort AS tmp, params
    WHERE tmp.id = tool.id
)
WHERE id IN (SELECT id FROM tmp_tool_sort);

UPDATE tool
SET "sort_order" = (
    SELECT new_sort_order
    FROM tmp_tool_sort
    WHERE tmp_tool_sort.id = tool.id
)
WHERE id IN (SELECT id FROM tmp_tool_sort);

-- 第 5 步:清理临时表
DROP TABLE IF EXISTS tmp_tool_sort;