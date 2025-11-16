UPDATE merged_table 
SET "Sort Order" = 44001 + (
    SELECT COUNT(*) - 1 
    FROM merged_table AS t2 
    WHERE t2.id < merged_table.id
);