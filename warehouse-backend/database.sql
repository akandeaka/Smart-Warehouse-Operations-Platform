-- ============================================
-- ADD DRIVER TABLES TO EXISTING DATABASE
-- ============================================

-- 1. DRIVERS TABLE
CREATE TABLE IF NOT EXISTS drivers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    vehicle_number VARCHAR(50),
    vehicle_type VARCHAR(50),
    driver_license VARCHAR(50),
    address TEXT,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_vehicle (vehicle_number)
);

-- 2. DRIVER ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS driver_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    driver_id INT NOT NULL,
    manifest_number VARCHAR(50) UNIQUE NOT NULL,
    assignment_date DATE NOT NULL,
    expected_return_date DATETIME NOT NULL,
    actual_return_date DATETIME,
    total_units INT NOT NULL DEFAULT 0,
    total_value DECIMAL(15,2) NOT NULL DEFAULT 0,
    status ENUM('assigned', 'returned', 'settled', 'flagged', 'disputed') DEFAULT 'assigned',
    notes TEXT,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES drivers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_driver (driver_id),
    INDEX idx_status (status),
    INDEX idx_date (assignment_date),
    INDEX idx_manifest (manifest_number)
);

-- 3. DRIVER ASSIGNMENT ITEMS TABLE
CREATE TABLE IF NOT EXISTS driver_assignment_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    assignment_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES driver_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_assignment (assignment_id),
    INDEX idx_product (product_id)
);

-- 4. DRIVER SETTLEMENTS TABLE
CREATE TABLE IF NOT EXISTS driver_settlements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    assignment_id INT NOT NULL,
    cash_returned DECIMAL(15,2) NOT NULL DEFAULT 0,
    cash_breakdown TEXT,
    returns_value DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_expected DECIMAL(15,2) NOT NULL DEFAULT 0,
    difference DECIMAL(15,2) NOT NULL DEFAULT 0,
    difference_type ENUM('exact', 'shortage', 'excess') NOT NULL,
    status ENUM('settled', 'flagged', 'investigating', 'resolved') DEFAULT 'settled',
    settled_by INT NOT NULL,
    settlement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES driver_assignments(id),
    FOREIGN KEY (settled_by) REFERENCES users(id),
    INDEX idx_assignment (assignment_id),
    INDEX idx_status (status),
    INDEX idx_date (settlement_date),
    INDEX idx_difference_type (difference_type)
);

-- 5. DRIVER SETTLEMENT ITEMS TABLE
CREATE TABLE IF NOT EXISTS driver_settlement_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    settlement_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity_assigned INT NOT NULL,
    quantity_returned INT NOT NULL,
    quantity_sold INT GENERATED ALWAYS AS (quantity_assigned - quantity_returned) STORED,
    unit_price DECIMAL(10,2) NOT NULL,
    returned_value DECIMAL(15,2) NOT NULL,
    condition ENUM('good', 'damaged', 'expired', 'missing') DEFAULT 'good',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (settlement_id) REFERENCES driver_settlements(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_settlement (settlement_id),
    INDEX idx_product (product_id),
    INDEX idx_condition (condition)
);

-- 6. INSERT DEFAULT RECONCILIATION USER
INSERT IGNORE INTO users (username, password, full_name, role) 
VALUES ('reconciliation', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Reconciliation Officer', 'reconciliation');

-- 7. UPDATE MANAGER PERMISSIONS
-- (Add driver management permissions to warehouse manager role)
INSERT IGNORE INTO permissions (role, module, can_view, can_create, can_edit, can_delete)
VALUES 
('warehouse_manager', 'drivers', 1, 1, 1, 1),
('warehouse_manager', 'driver_assignments', 1, 1, 1, 1),
('warehouse_manager', 'driver_settlements', 1, 1, 0, 0),
('reconciliation', 'driver_settlements', 1, 1, 0, 0);
