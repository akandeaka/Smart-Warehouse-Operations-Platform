-- ============================================================
-- VERIFICATION QUERIES
-- Run these to confirm your database is set up correctly
-- ============================================================

USE warehouse_stock_system;

-- 1. Check all tables exist
SELECT 'Tables Check' as test, COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema = 'warehouse_stock_system';

-- Expected: 10 tables

-- 2. Check warehouse value
SELECT 
    'Warehouse Value' as test,
    SUM(current_qty) as total_units,
    CONCAT('₦', FORMAT(SUM(current_qty * unit_cost), 2)) as total_value
FROM products;

-- 3. Check today's allocations
SELECT 
    'Today Allocations' as test,
    t.team_name,
    SUM(a.allocated_qty) as total_allocated
FROM sales_team_allocations a
JOIN sales_teams t ON a.team_id = t.id
WHERE a.allocated_date = CURDATE()
GROUP BY t.team_name;

-- 4. Check pending credit approvals
SELECT 
    'Pending Credits' as test,
    COUNT(*) as pending_count
FROM credit_approvals
WHERE status = 'pending';

-- 5. Check trigger works
-- Update a product quantity via stock_transactions
INSERT INTO stock_transactions (transaction_type, product_id, quantity_change, unit_cost_at_time, created_by, notes)
VALUES ('adjustment', 1, 10, 3500.00, 1, 'Test trigger');

-- Now check if products.current_qty increased by 10
SELECT product_name, current_qty FROM products WHERE id = 1;

-- Clean up test
DELETE FROM stock_transactions WHERE notes = 'Test trigger';

-- 6. Final summary
SELECT 
    'SETUP COMPLETE' as status,
    COUNT(DISTINCT id) as products_count,
    (SELECT COUNT(*) FROM sales_teams) as teams_count,
    (SELECT COUNT(*) FROM users) as users_count
FROM products;
