-- ============================================================
-- DATABASE: warehouse_stock_system
-- Complete schema with 10 tables, foreign keys, indexes, triggers
-- ============================================================

CREATE DATABASE IF NOT EXISTS warehouse_stock_system;
USE warehouse_stock_system;

-- ============================================================
-- TABLE 1: users
-- ============================================================
CREATE TABLE users (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    role            ENUM('warehouse_manager', 'chief_accountant', 'sales_rep', 'auditor') NOT NULL,
    team_id         INT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMP NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
);

-- ============================================================
-- TABLE 2: sales_teams
-- ============================================================
CREATE TABLE sales_teams (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    team_name       VARCHAR(100) NOT NULL UNIQUE,
    team_lead_name  VARCHAR(100),
    email           VARCHAR(100),
    phone           VARCHAR(20),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_team_name (team_name),
    INDEX idx_active (is_active)
);

-- ============================================================
-- Add foreign key to users (after sales_teams exists)
-- ============================================================
ALTER TABLE users 
ADD CONSTRAINT fk_users_team 
FOREIGN KEY (team_id) REFERENCES sales_teams(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE 3: products
-- ============================================================
CREATE TABLE products (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    sku             VARCHAR(50) UNIQUE NOT NULL,
    product_name    VARCHAR(200) NOT NULL,
    description     TEXT,
    unit_cost       DECIMAL(12,2) NOT NULL,
    selling_price   DECIMAL(12,2) NOT NULL,
    current_qty     INT NOT NULL DEFAULT 0,
    total_value     DECIMAL(12,2) GENERATED ALWAYS AS (current_qty * unit_cost) STORED,
    min_stock_level INT DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sku (sku),
    INDEX idx_product_name (product_name),
    INDEX idx_active (is_active),
    CONSTRAINT chk_qty_nonnegative CHECK (current_qty >= 0),
    CONSTRAINT chk_unit_cost_positive CHECK (unit_cost > 0)
);

-- ============================================================
-- TABLE 4: sales_orders
-- ============================================================
CREATE TABLE sales_orders (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    order_number        VARCHAR(50) UNIQUE NOT NULL,
    team_id             INT NOT NULL,
    customer_name       VARCHAR(150) NOT NULL,
    customer_phone      VARCHAR(20),
    total_amount        DECIMAL(12,2) NOT NULL,
    payment_method      ENUM('cash', 'bank_transfer', 'credit') NOT NULL,
    payment_status      ENUM('pending', 'partial', 'completed', 'reconciled') DEFAULT 'pending',
    approval_status     ENUM('pending', 'approved', 'rejected', 'not_required') DEFAULT 'not_required',
    approved_by         INT NULL,
    approved_at         TIMESTAMP NULL,
    rejection_reason    TEXT NULL,
    sales_date          DATE NOT NULL,
    created_by          INT NOT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_sales_orders_team FOREIGN KEY (team_id) REFERENCES sales_teams(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sales_orders_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sales_orders_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    
    INDEX idx_order_number (order_number),
    INDEX idx_team_date (team_id, sales_date),
    INDEX idx_payment_method (payment_method),
    INDEX idx_sales_date (sales_date),
    CONSTRAINT chk_total_amount_positive CHECK (total_amount > 0)
);

-- ============================================================
-- TABLE 5: sales_order_items
-- ============================================================
CREATE TABLE sales_order_items (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    order_id        INT NOT NULL,
    product_id      INT NOT NULL,
    quantity        INT NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL,
    total_price     DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    cost_of_goods   DECIMAL(12,2) NOT NULL,
    
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    
    INDEX idx_order (order_id),
    INDEX idx_product (product_id),
    CONSTRAINT chk_quantity_positive CHECK (quantity > 0)
);

-- ============================================================
-- TABLE 6: sales_team_allocations
-- ============================================================
CREATE TABLE sales_team_allocations (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    team_id         INT NOT NULL,
    product_id      INT NOT NULL,
    allocated_qty   INT NOT NULL,
    sold_qty        INT NOT NULL DEFAULT 0,
    returned_qty    INT NOT NULL DEFAULT 0,
    allocated_date  DATE NOT NULL,
    allocated_by    INT,
    status          ENUM('active', 'closed', 'partially_sold') DEFAULT 'active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_allocations_team FOREIGN KEY (team_id) REFERENCES sales_teams(id) ON DELETE RESTRICT,
    CONSTRAINT fk_allocations_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_allocations_allocated_by FOREIGN KEY (allocated_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_team_date (team_id, allocated_date),
    INDEX idx_status (status),
    CONSTRAINT chk_sold_not_exceed_allocated CHECK (sold_qty <= allocated_qty)
);

-- ============================================================
-- TABLE 7: credit_approvals
-- ============================================================
CREATE TABLE credit_approvals (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    order_id        INT NOT NULL UNIQUE,
    requested_by    INT NOT NULL,
    requested_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by     INT NULL,
    approved_at     TIMESTAMP NULL,
    status          ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    notes           TEXT,
    due_date        DATE,
    amount_due      DECIMAL(12,2) NOT NULL,
    
    CONSTRAINT fk_credit_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_credit_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_credit_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_status (status),
    INDEX idx_due_date (due_date)
);

-- ============================================================
-- TABLE 8: payment_reconciliations
-- ============================================================
CREATE TABLE payment_reconciliations (
    id                      INT PRIMARY KEY AUTO_INCREMENT,
    order_id                INT NOT NULL UNIQUE,
    payment_method          ENUM('cash', 'bank_transfer') NOT NULL,
    amount                  DECIMAL(12,2) NOT NULL,
    reconciliation_status   ENUM('pending', 'confirmed', 'failed', 'disputed') DEFAULT 'pending',
    cash_counter            INT NULL,
    cash_counted_at         TIMESTAMP NULL,
    bank_reference          VARCHAR(100) NULL,
    bank_confirmed_by       INT NULL,
    bank_confirmed_at       TIMESTAMP NULL,
    notes                   TEXT,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reconciled_at           TIMESTAMP NULL,
    
    CONSTRAINT fk_reconcile_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_reconcile_cash_counter FOREIGN KEY (cash_counter) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_reconcile_bank_confirmed_by FOREIGN KEY (bank_confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_status (reconciliation_status),
    INDEX idx_bank_reference (bank_reference)
);

-- ============================================================
-- TABLE 9: stock_transactions (Audit Trail)
-- ============================================================
CREATE TABLE stock_transactions (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    transaction_type    ENUM('purchase_in', 'allocate_to_team', 'return_from_team', 
                             'sale_out', 'adjustment', 'damage_loss') NOT NULL,
    product_id          INT NOT NULL,
    quantity_change     INT NOT NULL,
    unit_cost_at_time   DECIMAL(12,2) NOT NULL,
    reference_id        INT NULL,
    reference_type      VARCHAR(50) NULL,
    team_id             INT NULL,
    created_by          INT NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_team FOREIGN KEY (team_id) REFERENCES sales_teams(id) ON DELETE SET NULL,
    CONSTRAINT fk_stock_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    
    INDEX idx_product (product_id),
    INDEX idx_type_date (transaction_type, created_at),
    INDEX idx_reference (reference_type, reference_id),
    CONSTRAINT chk_quantity_not_zero CHECK (quantity_change != 0)
);

-- ============================================================
-- TABLE 10: daily_closures
-- ============================================================
CREATE TABLE daily_closures (
    id                              INT PRIMARY KEY AUTO_INCREMENT,
    closure_date                    DATE NOT NULL UNIQUE,
    closed_at                       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_by                       INT NOT NULL,
    warehouse_value_before_close    DECIMAL(15,2) NOT NULL,
    warehouse_value_after_close     DECIMAL(15,2) NOT NULL,
    total_sales_value               DECIMAL(15,2) NOT NULL,
    total_cash_collected            DECIMAL(15,2) DEFAULT 0,
    total_transfer_collected        DECIMAL(15,2) DEFAULT 0,
    total_credit_issued             DECIMAL(15,2) DEFAULT 0,
    unreconciled_count              INT DEFAULT 0,
    is_locked                       BOOLEAN DEFAULT TRUE,
    notes                           TEXT,
    
    CONSTRAINT fk_closure_closed_by FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_closure_date (closure_date)
);

-- ============================================================
-- TRIGGER: Auto-update products.current_qty
-- ============================================================
DELIMITER $$

CREATE TRIGGER update_product_qty_on_stock_transaction
AFTER INSERT ON stock_transactions
FOR EACH ROW
BEGIN
    UPDATE products 
    SET current_qty = current_qty + NEW.quantity_change
    WHERE id = NEW.product_id;
END$$

DELIMITER ;

-- ============================================================
-- VIEW: Daily Sales Summary
-- ============================================================
CREATE VIEW daily_sales_summary AS
SELECT 
    o.sales_date,
    t.team_name,
    COUNT(DISTINCT o.id) AS total_orders,
    SUM(o.total_amount) AS total_sales,
    SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END) AS cash_sales,
    SUM(CASE WHEN o.payment_method = 'bank_transfer' THEN o.total_amount ELSE 0 END) AS transfer_sales,
    SUM(CASE WHEN o.payment_method = 'credit' THEN o.total_amount ELSE 0 END) AS credit_sales
FROM sales_orders o
JOIN sales_teams t ON o.team_id = t.id
GROUP BY o.sales_date, t.team_name;

-- ============================================================
-- VIEW: Current Warehouse Stock Status
-- ============================================================
CREATE VIEW warehouse_stock_status AS
SELECT 
    p.id,
    p.sku,
    p.product_name,
    p.current_qty,
    p.unit_cost,
    p.total_value,
    p.min_stock_level,
    CASE 
        WHEN p.current_qty <= p.min_stock_level THEN 'LOW STOCK'
        WHEN p.current_qty = 0 THEN 'OUT OF STOCK'
        ELSE 'OK'
    END AS stock_status
FROM products p;
