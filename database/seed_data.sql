-- ============================================================
-- SEED DATA for warehouse_stock_system
-- Run AFTER schema.sql
-- ============================================================

USE warehouse_stock_system;

-- ============================================================
-- 1. SALES TEAMS
-- ============================================================
INSERT INTO sales_teams (team_name, team_lead_name, email, phone, is_active) VALUES
('Alpha Team', 'Chidi Okonkwo', 'alpha@warehouse.com', '08012340001', 1),
('Beta Team', 'Amara Eze', 'beta@warehouse.com', '08012340002', 1),
('Gamma Team', 'Bola Tinubu', 'gamma@warehouse.com', '08012340003', 1),
('Delta Team', 'Kunle Lawal', 'delta@warehouse.com', '08012340004', 1);

-- ============================================================
-- 2. USERS (password_hash is 'password123' hashed - replace in production)
-- ============================================================
INSERT INTO users (username, password_hash, full_name, email, role, team_id, is_active) VALUES
('warehouse_mgr', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Emeka Okafor', 'emeka@warehouse.com', 'warehouse_manager', NULL, 1),
('chief_accountant', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Ngozi Adeleke', 'ngozi@warehouse.com', 'chief_accountant', NULL, 1),
('auditor1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Audit Person', 'audit@warehouse.com', 'auditor', NULL, 1),
('alpha_lead', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Chidi Okonkwo', 'chidi@alpha.com', 'sales_rep', 1, 1),
('beta_lead', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Amara Eze', 'amara@beta.com', 'sales_rep', 2, 1),
('gamma_lead', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Bola Tinubu', 'bola@gamma.com', 'sales_rep', 3, 1),
('delta_lead', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Kunle Lawal', 'kunle@delta.com', 'sales_rep', 4, 1);

-- ============================================================
-- 3. PRODUCTS
-- ============================================================
INSERT INTO products (sku, product_name, description, unit_cost, selling_price, current_qty, min_stock_level, is_active) VALUES
('RICE-5KG', 'Premium Basmati Rice 5kg', 'Imported basmati rice, 5kg bag', 3500.00, 4200.00, 500, 50, 1),
('OIL-2L', 'Pure Vegetable Oil 2L', 'Pure vegetable cooking oil, 2 liters', 1800.00, 2300.00, 300, 30, 1),
('TOMATO-70G', 'Tomato Paste 70g', 'Double concentrated tomato paste, 70g', 150.00, 220.00, 1000, 100, 1),
('MILO-500G', 'Milo Beverage 500g', 'Malted chocolate drink, 500g tin', 1200.00, 1600.00, 200, 40, 1),
('INDOMIE-CTN', 'Indomie Noodles Carton', 'Instant noodles - 40 packs per carton', 4800.00, 6000.00, 150, 20, 1),
('SUGAR-1KG', 'Refined White Sugar 1kg', 'Pure refined white sugar, 1kg', 950.00, 1300.00, 400, 50, 1),
('FLOUR-10KG', 'Premium Baking Flour 10kg', 'High quality baking flour, 10kg', 3800.00, 4800.00, 120, 25, 1),
('DETTOL-SOAP', 'Dettol Soap Carton', 'Antibacterial soap - 24 pieces per carton', 5200.00, 7000.00, 80, 10, 1),
('PEAK-MILK', 'Peak Milk 900g', 'Powdered full cream milk, 900g tin', 2100.00, 2800.00, 250, 30, 1),
('BOURNVITA-500G', 'Bournvita 500g', 'Chocolate beverage, 500g tin', 1100.00, 1500.00, 180, 25, 1);

-- ============================================================
-- 4. STOCK TRANSACTIONS (Opening Balance)
-- ============================================================
INSERT INTO stock_transactions (transaction_type, product_id, quantity_change, unit_cost_at_time, created_by, notes) VALUES
('purchase_in', 1, 500, 3500.00, 1, 'Initial stock - Rice'),
('purchase_in', 2, 300, 1800.00, 1, 'Initial stock - Oil'),
('purchase_in', 3, 1000, 150.00, 1, 'Initial stock - Tomato paste'),
('purchase_in', 4, 200, 1200.00, 1, 'Initial stock - Milo'),
('purchase_in', 5, 150, 4800.00, 1, 'Initial stock - Indomie'),
('purchase_in', 6, 400, 950.00, 1, 'Initial stock - Sugar'),
('purchase_in', 7, 120, 3800.00, 1, 'Initial stock - Flour'),
('purchase_in', 8, 80, 5200.00, 1, 'Initial stock - Dettol'),
('purchase_in', 9, 250, 2100.00, 1, 'Initial stock - Peak milk'),
('purchase_in', 10, 180, 1100.00, 1, 'Initial stock - Bournvita');

-- ============================================================
-- 5. TODAY'S ALLOCATIONS
-- ============================================================
INSERT INTO sales_team_allocations (team_id, product_id, allocated_qty, allocated_date, allocated_by, status) VALUES
(1, 1, 50, CURDATE(), 1, 'active'),
(1, 2, 30, CURDATE(), 1, 'active'),
(2, 1, 40, CURDATE(), 1, 'active'),
(2, 5, 20, CURDATE(), 1, 'active'),
(3, 7, 25, CURDATE(), 1, 'active'),
(4, 9, 30, CURDATE(), 1, 'active');

-- ============================================================
-- 6. ALLOCATION STOCK MOVEMENTS
-- ============================================================
INSERT INTO stock_transactions (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by, notes) VALUES
('allocate_to_team', 1, -50, 3500.00, 'team_allocation', 1, 1, 'Allocated to Alpha Team'),
('allocate_to_team', 2, -30, 1800.00, 'team_allocation', 1, 1, 'Allocated to Alpha Team'),
('allocate_to_team', 1, -40, 3500.00, 'team_allocation', 2, 1, 'Allocated to Beta Team'),
('allocate_to_team', 5, -20, 4800.00, 'team_allocation', 2, 1, 'Allocated to Beta Team');

-- ============================================================
-- 7. SAMPLE SALES
-- ============================================================
-- Sale 1: Alpha Team - Cash (Reconciled)
INSERT INTO sales_orders (order_number, team_id, customer_name, total_amount, payment_method, payment_status, approval_status, sales_date, created_by) VALUES
('SALE-001', 1, 'Mrs. Grace Okoro', 42000.00, 'cash', 'reconciled', 'not_required', CURDATE(), 4);

INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, cost_of_goods) VALUES
(LAST_INSERT_ID(), 1, 10, 4200.00, 3500.00);

INSERT INTO payment_reconciliations (order_id, payment_method, amount, reconciliation_status, cash_counter, cash_counted_at, reconciled_at) VALUES
(LAST_INSERT_ID(), 'cash', 42000.00, 'confirmed', 2, NOW(), NOW());

-- Sale 2: Beta Team - Credit (Pending Approval)
INSERT INTO sales_orders (order_number, team_id, customer_name, total_amount, payment_method, payment_status, approval_status, sales_date, created_by) VALUES
('SALE-002', 2, 'XYZ Supermarket', 168000.00, 'credit', 'pending', 'pending', CURDATE(), 5);

INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, cost_of_goods) VALUES
(LAST_INSERT_ID(), 1, 40, 4200.00, 3500.00);

INSERT INTO credit_approvals (order_id, requested_by, status, due_date, amount_due) VALUES
(LAST_INSERT_ID(), 5, 'pending', DATE_ADD(CURDATE(), INTERVAL 14 DAY), 168000.00);
