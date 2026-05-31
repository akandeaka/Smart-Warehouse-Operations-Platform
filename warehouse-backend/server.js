// server.js - Complete Backend with Allocation Endpoints (FIXED)
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
        if (result && result[0] && result[0].connected === 1) {
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

app.get('/api/version', (req, res) => {
    res.json({ version: 'FINAL_V4', feature: 'database_confirmation', fixed: 'allocation_error' });
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
// ALLOCATIONS - FIXED
// ============================================================
app.post('/api/allocations', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { team_id, product_id, quantity, allocated_date } = req.body;
        
        if (!team_id || !product_id || !quantity || quantity < 1) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const allocationDate = allocated_date || new Date().toISOString().split('T')[0];
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            const [product] = await connection.query('SELECT unit_cost, current_qty FROM products WHERE id = ? AND is_active = 1', [product_id]);
            if (product.length === 0) {
                throw new Error('Product not found');
            }
            if (product[0].current_qty < quantity) {
                throw new Error(`Only ${product[0].current_qty} units available in warehouse`);
            }
            
            await connection.query(
                'UPDATE products SET current_qty = current_qty - ? WHERE id = ?',
                [quantity, product_id]
            );
            
            // FIXED: Properly quoted string 'active'
            const [existing] = await connection.query(
                'SELECT id, allocated_qty FROM sales_team_allocations WHERE team_id = ? AND product_id = ? AND allocated_date = ? AND status = ?',
                [team_id, product_id, allocationDate, 'active']
            );
            
            if (existing.length > 0) {
                await connection.query(
                    'UPDATE sales_team_allocations SET allocated_qty = allocated_qty + ?, confirmed = 0 WHERE id = ?',
                    [quantity, existing[0].id]
                );
            } else {
                await connection.query(
                    'INSERT INTO sales_team_allocations (team_id, product_id, allocated_qty, allocated_date, allocated_by, status, confirmed) VALUES (?, ?, ?, ?, ?, ?, 0)',
                    [team_id, product_id, quantity, allocationDate, req.user.id, 'active']
                );
            }
            
            await connection.query(
                'INSERT INTO stock_transactions (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                ['allocate_to_team', product_id, -quantity, product[0].unit_cost, 'team_allocation', team_id, req.user.id, 'Manager allocation']
            );
            
            await connection.commit();
            res.json({ success: true, message: `Allocated ${quantity} units to team` });
        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Allocation error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/allocations/today', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [allocations] = await pool.query(
            `SELECT a.id, t.team_name, p.product_name, a.allocated_qty, a.sold_qty, a.returned_qty, a.status, a.confirmed
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

// Get team's allocated stock for today - FIXED
app.get('/api/sales/team/:teamId/allocations', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [allocations] = await pool.query(
            `SELECT p.id, p.product_name, p.selling_price, 
                    a.allocated_qty, a.sold_qty, a.returned_qty, a.confirmed,
                    (a.allocated_qty - a.sold_qty - a.returned_qty) as remaining_qty
             FROM sales_team_allocations a
             JOIN products p ON a.product_id = p.id
             WHERE a.team_id = ? AND a.allocated_date = ? AND a.status = ?`,
            [teamId, date, 'active']
        );
        
        res.json({ success: true, data: allocations });
    } catch (error) {
        console.error('Get allocations error:', error);
        res.json({ success: true, data: [] });
    }
});

// Confirm allocation
app.post('/api/allocations/confirm', authMiddleware, async (req, res) => {
    try {
        const { team_id, allocated_date } = req.body;
        
        await pool.query(
            'UPDATE sales_team_allocations SET confirmed = 1 WHERE team_id = ? AND allocated_date = ?',
            [team_id, allocated_date]
        );
        
        res.json({ success: true, message: 'Allocation confirmed successfully' });
    } catch (error) {
        console.error('Confirm allocation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get confirmation status
app.get('/api/allocations/confirmation-status/:teamId/:date', authMiddleware, async (req, res) => {
    try {
        const { teamId, date } = req.params;
        
        const [result] = await pool.query(
            'SELECT confirmed FROM sales_team_allocations WHERE team_id = ? AND allocated_date = ? LIMIT 1',
            [teamId, date]
        );
        
        const isConfirmed = result.length > 0 && result[0].confirmed === 1;
        res.json({ success: true, confirmed: isConfirmed });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// SALES
// ============================================================
app.post('/api/sales', authMiddleware, async (req, res) => {
    let connection;
    try {
        const { team_id, customer_name, customer_phone, items, payment_method, sales_date, credit_due_date } = req.body;
        
        if (!team_id || !customer_name || !items || items.length === 0 || !payment_method) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        let total_amount = 0;
        for (const item of items) {
            total_amount += item.quantity * item.unit_price;
        }
        
        const order_number = `SALE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const saleDate = sales_date || new Date().toISOString().split('T')[0];
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            const [orderResult] = await connection.query(
                `INSERT INTO sales_orders 
                 (order_number, team_id, customer_name, customer_phone, total_amount, payment_method, sales_date, created_by, approval_status, payment_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [order_number, team_id, customer_name, customer_phone, total_amount, payment_method, saleDate, req.user.id, 
                 payment_method === 'credit' ? 'pending' : 'not_required', 'pending']
            );
            
            const order_id = orderResult.insertId;
            
            for (const item of items) {
                await connection.query(
                    `INSERT INTO sales_order_items (order_id, product_id, quantity, unit_price, cost_of_goods)
                     VALUES (?, ?, ?, ?, (SELECT unit_cost FROM products WHERE id = ?))`,
                    [order_id, item.product_id, item.quantity, item.unit_price, item.product_id]
                );
                
                await connection.query(
                    `UPDATE sales_team_allocations 
                     SET sold_qty = sold_qty + ?
                     WHERE team_id = ? AND product_id = ? AND allocated_date = ? AND status = ?`,
                    [item.quantity, team_id, item.product_id, saleDate, 'active']
                );
            }
            
            if (payment_method === 'credit') {
                await connection.query(
                    `INSERT INTO credit_approvals (order_id, requested_by, approved, rejected, amount_due, due_date)
                     VALUES (?, ?, 0, 0, ?, ?)`,
                    [order_id, req.user.id, total_amount, credit_due_date || null]
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
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/sales/team/:teamId/history', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        
        const [orders] = await pool.query(
            `SELECT id, order_number, customer_name, total_amount, payment_method, payment_status, approval_status, created_at
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

app.get('/api/sales/order/:orderId/items', authMiddleware, async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const [items] = await pool.query(
            `SELECT oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) as total_price, p.product_name
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

// Check if sales already submitted
app.get('/api/sales/check-submitted/:teamId/:date', authMiddleware, async (req, res) => {
    try {
        const { teamId, date } = req.params;
        
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM sales_orders WHERE team_id = ? AND sales_date = ? AND submitted_for_review = 1',
            [teamId, date]
        );
        
        const isSubmitted = result[0]?.count > 0;
        res.json({ success: true, submitted: isSubmitted });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// CREDIT APPROVALS
// ============================================================
app.get('/api/approvals/pending', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, o.payment_method, 
                    u.full_name as requested_by, c.requested_at, c.due_date
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             JOIN users u ON c.requested_by = u.id
             WHERE c.approved = 0 AND c.rejected = 0`
        );
        res.json({ success: true, data: approvals });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/approvals/my-requests', authMiddleware, async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, 
                    c.approved, c.rejected, c.requested_at, c.due_date
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

app.post('/api/approvals/approve', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { approval_id, approved_amount } = req.body;
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [approval] = await connection.query('SELECT order_id FROM credit_approvals WHERE id = ?', [approval_id]);
        if (approval.length === 0) throw new Error('Approval not found');
        const order_id = approval[0].order_id;
        
        if (approved_amount && approved_amount > 0) {
            await connection.query('UPDATE sales_orders SET total_amount = ? WHERE id = ?', [approved_amount, order_id]);
        }
        
        await connection.query(
            'UPDATE credit_approvals SET approved = 1, approved_by = ?, approved_at = NOW() WHERE id = ?',
            [req.user.id, approval_id]
        );
        
        await connection.query(
            'UPDATE sales_orders SET approval_status = "approved", payment_status = "pending" WHERE id = ?',
            [order_id]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Credit approved successfully' });
        
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/approvals/reject', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { approval_id } = req.body;
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [approval] = await connection.query('SELECT order_id FROM credit_approvals WHERE id = ?', [approval_id]);
        if (approval.length === 0) throw new Error('Approval not found');
        const order_id = approval[0].order_id;
        
        await connection.query(
            'UPDATE credit_approvals SET rejected = 1, approved_by = ?, approved_at = NOW() WHERE id = ?',
            [req.user.id, approval_id]
        );
        
        await connection.query(
            'UPDATE sales_orders SET approval_status = "rejected" WHERE id = ?',
            [order_id]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Credit rejected successfully' });
        
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// SUBMIT DAY SALES & PENDING RETURNS
// ============================================================
app.post('/api/sales/submit-day', authMiddleware, async (req, res) => {
    try {
        const { team_id, sales_date } = req.body;
        await pool.query('UPDATE sales_orders SET submitted_for_review = 1 WHERE team_id = ? AND sales_date = ? AND submitted_for_review = 0', [team_id, sales_date]);
        res.json({ success: true, message: 'Sales submitted' });
    } catch (error) { 
        res.status(500).json({ success: false, message: error.message }); 
    }
});

app.get('/api/sales/pending-submissions', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [items] = await pool.query(`SELECT so.id, st.team_name, so.customer_name, p.product_name, soi.quantity, (soi.quantity * soi.unit_price) as amount, so.payment_method as type FROM sales_orders so JOIN sales_teams st ON so.team_id = st.id JOIN sales_order_items soi ON so.id = soi.order_id JOIN products p ON soi.product_id = p.id WHERE so.submitted_for_review = 1 AND so.manager_confirmed = 0`);
        res.json({ success: true, data: items });
    } catch (error) { 
        res.status(500).json({ success: false, message: error.message }); 
    }
});

app.post('/api/sales/confirm-return', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { item_id, action } = req.body;
        if (action === 'accept') await pool.query('UPDATE sales_orders SET manager_confirmed = 1 WHERE id = ?', [item_id]);
        else if (action === 'reject') await pool.query('UPDATE sales_orders SET submitted_for_review = 0 WHERE id = ?', [item_id]);
        res.json({ success: true });
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
                    COALESCE(SUM(o.total_amount), 0) as total_sales,
                    COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END), 0) as cash_sales,
                    COALESCE(SUM(CASE WHEN o.payment_method = 'bank_transfer' THEN o.total_amount ELSE 0 END), 0) as transfer_sales,
                    COALESCE(SUM(CASE WHEN o.payment_method = 'credit' THEN o.total_amount ELSE 0 END), 0) as credit_sales
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
// DAILY CLOSURE - FIXED
// ============================================================
app.post('/api/daily/close', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const today = new Date().toISOString().split('T')[0];
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [unsold] = await connection.query(
            `SELECT team_id, product_id, (allocated_qty - sold_qty - returned_qty) as to_return
             FROM sales_team_allocations
             WHERE allocated_date = ? AND (allocated_qty - sold_qty - returned_qty) > 0 AND status = ?`,
            [today, 'active']
        );
        
        for (const item of unsold) {
            await connection.query(
                `UPDATE sales_team_allocations 
                 SET returned_qty = returned_qty + ?, status = ?
                 WHERE team_id = ? AND product_id = ? AND allocated_date = ?`,
                [item.to_return, 'closed', item.team_id, item.product_id, today]
            );
            
            await connection.query(
                `UPDATE products SET current_qty = current_qty + ? WHERE id = ?`,
                [item.to_return, item.product_id]
            );
            
            await connection.query(
                `INSERT INTO stock_transactions 
                 (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by)
                 VALUES (?, ?, ?, (SELECT unit_cost FROM products WHERE id = ?), ?, ?, ?)`,
                ['return_from_team', item.product_id, item.to_return, item.product_id, 'daily_closure', item.team_id, req.user.id]
            );
        }
        
        const [beforeValue] = await connection.query('SELECT COALESCE(SUM(current_qty * unit_cost), 0) as value FROM products');
        const [salesTotal] = await connection.query('SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE sales_date = ?', [today]);
        const [afterValue] = await connection.query('SELECT COALESCE(SUM(current_qty * unit_cost), 0) as value FROM products');
        
        await connection.query(
            `INSERT INTO daily_closures 
             (closure_date, closed_by, warehouse_value_before_close, warehouse_value_after_close, total_sales_value, is_locked)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [today, req.user.id, beforeValue[0].value, afterValue[0].value, salesTotal[0].total]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Day closed successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
    console.log('Testing database connection...');
    const dbConnected = await testConnection();
    
    if (dbConnected) {
        console.log('Database connected. Starting server...');
    } else {
        console.log('Database connection failed. Starting server with limited functionality...');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log('Server running on port ' + PORT);
        console.log('Health: https://warehouse-backend-new-u9rq.onrender.com/health');
    });
}

startServer();
// Get team's allocated stock for today - FIXED to exclude submitted sales
app.get('/api/sales/team/:teamId/allocations', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        const today = new Date().toISOString().split('T')[0];
        
        const [allocations] = await pool.query(
            `SELECT p.id, p.product_name, p.selling_price, 
                    a.allocated_qty, a.sold_qty, a.returned_qty, a.confirmed,
                    (a.allocated_qty - a.sold_qty - a.returned_qty) as remaining_qty
             FROM sales_team_allocations a
             JOIN products p ON a.product_id = p.id
             WHERE a.team_id = ? 
             AND a.allocated_date = ?
             AND a.status = 'active'
             AND (a.allocated_qty - a.sold_qty - a.returned_qty) > 0`,
            [teamId, today]
        );
        
        res.json({ success: true, data: allocations });
    } catch (error) {
        console.error('Get team allocations error:', error);
        res.json({ success: true, data: [] });
    }
});
// SUBMIT DAY SALES - should make sales no longer visible
app.post('/api/sales/submit-day', authMiddleware, async (req, res) => {
    try {
        const { team_id, sales_date } = req.body;
        
        // This marks the sales as submitted so they won't appear in active allocations
        await pool.query(
            'UPDATE sales_team_allocations SET status = "submitted" WHERE team_id = ? AND allocated_date = ? AND status = "active"',
            [team_id, sales_date]
        );
        
        res.json({ success: true, message: 'Sales submitted for the day' });
    } catch (error) { 
        res.status(500).json({ success: false, message: error.message }); 
    }
});
awa// ALWAYS insert new allocation, don't update existing
app.post('/api/allocations', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    // ... validation code ...
    
    // REMOVE the existing check - always insert new allocation
    await connection.query(
        `INSERT INTO sales_team_allocations (team_id, product_id, allocated_qty, allocated_date, allocated_by, status, confirmed)
         VALUES (?, ?, ?, ?, ?, 'active', 0)`,
        [team_id, product_id, quantity, allocationDate, req.user.id]
    );
    
    // ... rest of code ...
});it pool.query('SELECT * FROM table WHERE status = ?', [teamId, 'active'])  // CORRECT

