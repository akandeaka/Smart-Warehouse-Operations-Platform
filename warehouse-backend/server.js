// server.js - Complete Backend with Allocation Endpoints
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool, testConnection } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const decoded = Buffer.from(token, 'base64').toString().split(':');
        req.user = { 
            id: 1, 
            username: decoded[0], 
            role: decoded[0] === 'warehouse_mgr' ? 'warehouse_manager' : 'sales_rep',
            team_id: decoded[0] === 'warehouse_mgr' ? null : 1
        };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied. Requires role: ' + roles.join(' or ') });
        }
        next();
    };
};

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', async (req, res) => {
    let dbStatus = 'not_connected';
    let dbError = null;
    
    try {
        const [result] = await pool.query('SELECT 1 as connected');
        if (result && result[0].connected === 1) {
            dbStatus = 'connected';
        }
    } catch (error) {
        dbStatus = 'failed';
        dbError = error.message;
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: {
            status: dbStatus,
            error: dbError,
            host: process.env.DB_HOST?.split('.')[0] + '...' || 'not_set'
        }
    });
});

// ============================================================
// LOGIN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        if (password !== 'password123') {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                team_id: user.team_id
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// TEAMS
// ============================================================
app.get('/api/teams', authMiddleware, async (req, res) => {
    try {
        const [teams] = await pool.query('SELECT id, team_name FROM sales_teams WHERE is_active = 1');
        res.json({ success: true, data: teams });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// PRODUCTS
// ============================================================
app.get('/api/products', authMiddleware, async (req, res) => {
    try {
        const [products] = await pool.query(
            'SELECT id, product_name, current_qty, unit_cost, selling_price FROM products WHERE is_active = 1'
        );
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// ALLOCATIONS
// ============================================================
app.post('/api/allocations', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { team_id, product_id, quantity, allocated_date } = req.body;
        
        if (!team_id || !product_id || !quantity || quantity < 1) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // Check if product has enough stock
            const [product] = await connection.query('SELECT unit_cost, current_qty FROM products WHERE id = ?', [product_id]);
            if (product.length === 0) {
                throw new Error('Product not found');
            }
            if (product[0].current_qty < quantity) {
                throw new Error(`Only ${product[0].current_qty} units available in warehouse`);
            }
            
            // Check if allocation already exists for today
            const [existing] = await connection.query(
                'SELECT id FROM sales_team_allocations WHERE team_id = ? AND product_id = ? AND allocated_date = ?',
                [team_id, product_id, allocated_date]
            );
            
            if (existing.length > 0) {
                await connection.query(
                    'UPDATE sales_team_allocations SET allocated_qty = allocated_qty + ? WHERE id = ?',
                    [quantity, existing[0].id]
                );
            } else {
                await connection.query(
                    `INSERT INTO sales_team_allocations (team_id, product_id, allocated_qty, allocated_date, allocated_by, status)
                     VALUES (?, ?, ?, ?, ?, 'active')`,
                    [team_id, product_id, quantity, allocated_date, req.user.id]
                );
            }
            
            // Record stock transaction (trigger will update products.current_qty)
            await connection.query(
                `INSERT INTO stock_transactions 
                 (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by, notes)
                 VALUES ('allocate_to_team', ?, ?, ?, 'team_allocation', ?, ?, 'Manager allocation')`,
                [product_id, -quantity, product[0].unit_cost, team_id, req.user.id]
            );
            
            await connection.commit();
            res.json({ success: true, message: `Allocated ${quantity} units to team` });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get today's allocations
app.get('/api/allocations/today', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [allocations] = await pool.query(
            `SELECT a.id, t.team_name, p.product_name, a.allocated_qty, a.sold_qty, a.returned_qty, a.status
             FROM sales_team_allocations a
             JOIN sales_teams t ON a.team_id = t.id
             JOIN products p ON a.product_id = p.id
             WHERE a.allocated_date = ?
             ORDER BY t.team_name, p.product_name`,
            [today]
        );
        res.json({ success: true, data: allocations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get team's allocated stock for today
app.get('/api/sales/team/:teamId/allocations', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        const today = new Date().toISOString().split('T')[0];
        
        const [allocations] = await pool.query(
            `SELECT p.id, p.product_name, p.selling_price, 
                    a.allocated_qty, a.sold_qty, 
                    (a.allocated_qty - a.sold_qty - a.returned_qty) as remaining_qty
             FROM sales_team_allocations a
             JOIN products p ON a.product_id = p.id
             WHERE a.team_id = ? AND a.allocated_date = ? AND a.status = 'active'`,
            [teamId, today]
        );
        
        res.json({ success: true, data: allocations });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ============================================================
// SALES
// ============================================================
app.post('/api/sales', authMiddleware, async (req, res) => {
    try {
        const { team_id, customer_name, customer_phone, items, payment_method, sales_date } = req.body;
        
        if (!team_id || !customer_name || !items || items.length === 0 || !payment_method) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        let total_amount = 0;
        for (const item of items) {
            total_amount += item.quantity * item.unit_price;
        }
        
        const order_number = `SALE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            const [orderResult] = await connection.query(
                `INSERT INTO sales_orders 
                 (order_number, team_id, customer_name, customer_phone, total_amount, payment_method, sales_date, created_by, approval_status, payment_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [order_number, team_id, customer_name, customer_phone, total_amount, payment_method, sales_date, req.user.id, 
                 payment_method === 'credit' ? 'pending' : 'not_required',
                 'pending']
            );
            
            const order_id = orderResult.insertId;
            
            for (const item of items) {
                await connection.query(
                    `INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, cost_of_goods)
                     VALUES (?, ?, ?, ?, (SELECT unit_cost FROM products WHERE id = ?))`,
                    [order_id, item.product_id, item.quantity, item.unit_price, item.product_id]
                );
                
                // Update allocation sold_qty
                await connection.query(
                    `UPDATE sales_team_allocations 
                     SET sold_qty = sold_qty + ?
                     WHERE team_id = ? AND product_id = ? AND allocated_date = CURDATE()`,
                    [item.quantity, team_id, item.product_id]
                );
            }
            
            if (payment_method === 'credit') {
                await connection.query(
                    `INSERT INTO credit_approvals (order_id, requested_by, status, amount_due, due_date)
                     VALUES (?, ?, 'pending', ?, DATE_ADD(CURDATE(), INTERVAL 14 DAY))`,
                    [order_id, req.user.id, total_amount]
                );
            } else {
                await connection.query(
                    `INSERT INTO payment_reconciliations (order_id, payment_method, amount, reconciliation_status)
                     VALUES (?, ?, ?, 'pending')`,
                    [order_id, payment_method, total_amount]
                );
            }
            
            await connection.commit();
            
            res.json({
                success: true,
                order_id,
                order_number,
                message: payment_method === 'credit' ? 'Credit sale pending approval' : 'Sale recorded. Pending payment confirmation.'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get team's sales history
app.get('/api/sales/team/:teamId/history', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        
        const [orders] = await pool.query(
            `SELECT id, order_number, customer_name, total_amount, payment_method, payment_status, created_at
             FROM sales_orders
             WHERE team_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [teamId]
        );
        
        res.json({ success: true, data: orders });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// Get order items
app.get('/api/sales/order/:orderId/items', authMiddleware, async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [items] = await pool.query(
            `SELECT oi.quantity, oi.unit_price, oi.total_price, p.product_name
             FROM sales_order_items oi
             JOIN products p ON oi.product_id = p.id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        
        res.json({ success: true, data: items });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// ============================================================
// CREDIT APPROVALS
// ============================================================
app.get('/api/approvals/pending', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, u.full_name as requested_by, c.requested_at
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             JOIN users u ON c.requested_by = u.id
             WHERE c.status = 'pending'`
        );
        res.json({ success: true, data: approvals });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

app.get('/api/approvals/my-requests', authMiddleware, async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, c.status, c.requested_at
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             WHERE o.created_by = ?
             ORDER BY c.requested_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, data: requests });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

app.put('/api/approvals/:id', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            if (status === 'approved') {
                const [items] = await connection.query(
                    `SELECT oi.product_id, oi.quantity, oi.cost_of_goods, o.team_id
                     FROM credit_approvals c
                     JOIN sales_orders o ON c.order_id = o.id
                     JOIN sales_order_items oi ON o.id = oi.order_id
                     WHERE c.id = ?`,
                    [id]
                );
                
                for (const item of items) {
                    await connection.query(
                        `UPDATE sales_team_allocations 
                         SET sold_qty = sold_qty + ?
                         WHERE team_id = ? AND product_id = ? AND allocated_date = CURDATE()`,
                        [item.quantity, item.team_id, item.product_id]
                    );
                    
                    await connection.query(
                        `INSERT INTO stock_transactions 
                         (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by)
                         VALUES ('sale_out', ?, ?, ?, 'sales_order', ?, ?)`,
                        [item.product_id, -item.quantity, item.cost_of_goods, item.team_id, req.user.id]
                    );
                }
                
                await connection.query(
                    `UPDATE credit_approvals SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
                    [req.user.id, id]
                );
                
                await connection.query(
                    `UPDATE sales_orders o
                     JOIN credit_approvals c ON o.id = c.order_id
                     SET o.approval_status = 'approved', o.payment_status = 'completed'
                     WHERE c.id = ?`,
                    [id]
                );
            } else {
                await connection.query(
                    `UPDATE credit_approvals SET status = 'rejected', approved_by = ?, approved_at = NOW() WHERE id = ?`,
                    [req.user.id, id]
                );
            }
            
            await connection.commit();
            res.json({ success: true, message: `Credit ${status}` });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// REPORTS
// ============================================================
app.get('/api/reports/daily', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [report] = await pool.query(
            `SELECT t.team_name,
                    COUNT(DISTINCT o.id) as num_orders,
                    SUM(o.total_amount) as total_sales,
                    SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END) as cash_sales,
                    SUM(CASE WHEN o.payment_method = 'bank_transfer' THEN o.total_amount ELSE 0 END) as transfer_sales,
                    SUM(CASE WHEN o.payment_method = 'credit' THEN o.total_amount ELSE 0 END) as credit_sales
             FROM sales_teams t
             LEFT JOIN sales_orders o ON t.id = o.team_id AND o.sales_date = ?
             GROUP BY t.id`,
            [today]
        );
        
        res.json({ success: true, date: today, teams: report });
    } catch (error) {
        res.json({ success: true, date: new Date().toISOString().split('T')[0], teams: [] });
    }
});

// ============================================================
// DAILY CLOSURE
// ============================================================
app.post('/api/daily/close', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            const [unsold] = await connection.query(
                `SELECT team_id, product_id, (allocated_qty - sold_qty - returned_qty) as to_return
                 FROM sales_team_allocations
                 WHERE allocated_date = ? AND (allocated_qty - sold_qty - returned_qty) > 0`,
                [today]
            );
            
            for (const item of unsold) {
                await connection.query(
                    `UPDATE sales_team_allocations 
                     SET returned_qty = returned_qty + ?, status = 'closed'
                     WHERE team_id = ? AND product_id = ? AND allocated_date = ?`,
                    [item.to_return, item.team_id, item.product_id, today]
                );
                
                await connection.query(
                    `INSERT INTO stock_transactions 
                     (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by)
                     VALUES ('return_from_team', ?, ?, (SELECT unit_cost FROM products WHERE id = ?), 'daily_closure', ?, ?)`,
                    [item.product_id, item.to_return, item.product_id, item.team_id, req.user.id]
                );
            }
            
            // Get warehouse values
            const [beforeValue] = await connection.query('SELECT SUM(current_qty * unit_cost) as value FROM products');
            const [salesTotal] = await connection.query(
                'SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE sales_date = ?',
                [today]
            );
            const [afterValue] = await connection.query('SELECT SUM(current_qty * unit_cost) as value FROM products');
            
            await connection.query(
                `INSERT INTO daily_closures 
                 (closure_date, closed_by, warehouse_value_before_close, warehouse_value_after_close, total_sales_value, is_locked)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [today, req.user.id, beforeValue[0].value || 0, afterValue[0].value || 0, salesTotal[0].total || 0]
            );
            
            await connection.commit();
            res.json({ success: true, message: 'Day closed successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
    console.log('🔄 Testing database connection...');
    const dbConnected = await testConnection();
    
    if (dbConnected) {
        console.log('✅ Database connected. Starting server...');
    } else {
        console.log('⚠️ Database connection failed. Starting server with limited functionality...');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`📍 Health: https://warehouse-backend-api-2fye.onrender.com/health`);
    });
}

startServer();
