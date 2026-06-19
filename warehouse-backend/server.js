// server.js - Complete Backend with RBAC, 2FA, and PWA Support
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');

const { pool, testConnection } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// ============================================================
// SERVE STATIC FILES
// ============================================================
const possiblePaths = [
    path.join(__dirname, 'frontend'),
    path.join(__dirname, '../frontend'),
    path.join(process.cwd(), 'frontend'),
    path.join(process.cwd(), 'warehouse-backend', 'frontend'),
    '/opt/render/project/src/frontend',
    '/opt/render/project/src/warehouse-backend/frontend'
];

let frontendPath = null;
for (const testPath of possiblePaths) {
    try {
        if (fs.existsSync(testPath)) {
            frontendPath = testPath;
            console.log(`✅ Found frontend at: ${frontendPath}`);
            break;
        }
    } catch (err) {
        // Ignore errors
    }
}

if (!frontendPath) {
    const searchPaths = ['/opt/render/project/src', process.cwd(), __dirname];
    for (const basePath of searchPaths) {
        try {
            const files = fs.readdirSync(basePath);
            if (files.includes('frontend')) {
                frontendPath = path.join(basePath, 'frontend');
                break;
            }
            if (files.includes('login.html')) {
                frontendPath = basePath;
                break;
            }
        } catch (err) {
            // Ignore errors
        }
    }
}

if (frontendPath) {
    app.use(express.static(frontendPath));
    console.log(`✅ Static files served from: ${frontendPath}`);
} else {
    console.error('❌ Frontend directory not found');
}

// ============================================================
// SERVE MANIFEST.JSON FROM ROOT
// ============================================================
app.get('/manifest.json', (req, res) => {
    const manifestPath = path.join(__dirname, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        res.sendFile(manifestPath);
        console.log('✅ Serving manifest.json');
    } else {
        console.log('❌ manifest.json not found at:', manifestPath);
        res.status(404).json({ error: 'manifest.json not found' });
    }
});

// Root route
app.get('/', (req, res) => {
    if (frontendPath) {
        const loginPath = path.join(frontendPath, 'login.html');
        if (fs.existsSync(loginPath)) {
            res.sendFile(loginPath);
        } else {
            res.status(404).send('login.html not found');
        }
    } else {
        res.status(500).send('Frontend directory not configured');
    }
});

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
        const username = decoded[0];
        
        const [users] = await pool.query(
            'SELECT id, role, team_id FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        req.user = {
            id: users[0].id,
            username: username,
            role: users[0].role,
            team_id: users[0].team_id
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
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    };
};

// ============================================================
// SUPER ADMIN MIDDLEWARE
// ============================================================
const superAdminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const decoded = Buffer.from(token, 'base64').toString().split(':');
        
        const [users] = await pool.query(
            'SELECT role FROM users WHERE username = ? AND is_active = 1',
            [decoded[0]]
        );
        
        if (users.length === 0 || users[0].role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
        }
        
        req.user = { username: decoded[0], role: users[0].role };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================================
// 2FA AND PORTAL-SPECIFIC LOGIN
// ============================================================
const twofaPending = new Map();

app.post('/api/auth/login-portal', async (req, res) => {
    try {
        const { username, password, portal } = req.body;
        
        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id, is_active, twofa_secret FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (users.length === 0 || password !== 'password123') {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        let roleMatch = false;
        let redirectUrl = '';
        
        switch(portal) {
            case 'super-admin':
                roleMatch = (user.role === 'super_admin');
                redirectUrl = '/super-admin.html';
                break;
            case 'manager':
                roleMatch = (user.role === 'warehouse_manager');
                redirectUrl = '/manager-dashboard.html';
                break;
            case 'sales':
                roleMatch = (user.role === 'sales_rep');
                redirectUrl = '/sales-dashboard.html';
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid portal' });
        }
        
        if (!roleMatch) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Your role: ${user.role}`
            });
        }
        
        if (user.role === 'super_admin' && user.twofa_secret) {
            const sessionId = Math.random().toString(36).substring(2, 15);
            twofaPending.set(sessionId, {
                userId: user.id,
                username: user.username,
                role: user.role,
                redirectUrl: redirectUrl,
                expiresAt: Date.now() + (5 * 60 * 1000)
            });
            
            return res.json({
                success: true,
                requiresTwoFA: true,
                sessionId: sessionId,
                message: '2FA required. Enter your secret code.'
            });
        }
        
        const token = Buffer.from(`${user.username}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            token: token,
            redirectUrl: redirectUrl,
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

app.post('/api/auth/verify-2fa', async (req, res) => {
    try {
        const { sessionId, secretCode } = req.body;
        
        const pending = twofaPending.get(sessionId);
        if (!pending || Date.now() > pending.expiresAt) {
            twofaPending.delete(sessionId);
            return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
        }
        
        const [users] = await pool.query('SELECT twofa_secret FROM users WHERE id = ?', [pending.userId]);
        
        if (users.length === 0 || users[0].twofa_secret !== secretCode) {
            return res.status(401).json({ success: false, message: 'Invalid secret code. Access denied.' });
        }
        
        const token = Buffer.from(`${pending.username}:${Date.now()}`).toString('base64');
        twofaPending.delete(sessionId);
        
        res.json({
            success: true,
            token: token,
            redirectUrl: pending.redirectUrl,
            user: { id: pending.userId, username: pending.username, role: pending.role }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/auth/validate-portal', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const requestedPortal = req.query.portal;
        
        if (!token) {
            return res.json({ valid: false, message: 'No token' });
        }
        
        const decoded = Buffer.from(token, 'base64').toString().split(':');
        const username = decoded[0];
        
        const [users] = await pool.query(
            'SELECT role FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (users.length === 0) {
            return res.json({ valid: false, message: 'User not found' });
        }
        
        const user = users[0];
        let roleMatch = false;
        
        switch(requestedPortal) {
            case 'super-admin': roleMatch = (user.role === 'super_admin'); break;
            case 'manager': roleMatch = (user.role === 'warehouse_manager'); break;
            case 'sales': roleMatch = (user.role === 'sales_rep'); break;
            default: roleMatch = false;
        }
        
        res.json({ valid: roleMatch, role: user.role });
        
    } catch (error) {
        res.json({ valid: false, message: error.message });
    }
});

app.get('/api/admin/validate', superAdminMiddleware, async (req, res) => {
    res.json({ valid: true, role: req.user.role });
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (error) {
        res.json({ status: 'healthy', database: 'error' });
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
    let connection;
    try {
        const { team_id, product_id, quantity, allocated_date } = req.body;
        
        if (!team_id || !product_id || !quantity || quantity < 1) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const allocationDate = allocated_date || new Date().toISOString().split('T')[0];
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [product] = await connection.query('SELECT unit_cost, current_qty FROM products WHERE id = ? AND is_active = 1', [product_id]);
        if (product.length === 0) throw new Error('Product not found');
        if (product[0].current_qty < quantity) throw new Error(`Only ${product[0].current_qty} units available`);
        
        await connection.query('UPDATE products SET current_qty = current_qty - ? WHERE id = ?', [quantity, product_id]);
        
        await connection.query(
            'INSERT INTO sales_team_allocations (team_id, product_id, allocated_qty, allocated_date, allocated_by, status, confirmed) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [team_id, product_id, quantity, allocationDate, req.user.id, 'active']
        );
        
        await connection.query(
            'INSERT INTO stock_transactions (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, team_id, created_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['allocate_to_team', product_id, -quantity, product[0].unit_cost, 'team_allocation', team_id, req.user.id, 'Manager allocation']
        );
        
        await connection.commit();
        res.json({ success: true, message: `Allocated ${quantity} units to team` });
    } catch (error) {
        if (connection) await connection.rollback();
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
             WHERE a.team_id = ? AND a.allocated_date = ? AND a.status = ?
               AND (a.allocated_qty - a.sold_qty - a.returned_qty) > 0`,
            [teamId, date, 'active']
        );
        
        res.json({ success: true, data: allocations });
    } catch (error) {
        console.error('Get allocations error:', error);
        res.json({ success: true, data: [] });
    }
});

app.post('/api/allocations/confirm', authMiddleware, async (req, res) => {
    try {
        const { team_id, allocated_date } = req.body;
        
        // Only confirm allocations that are NOT already confirmed
        const [result] = await pool.query(
            'UPDATE sales_team_allocations SET confirmed = 1 WHERE team_id = ? AND allocated_date = ? AND confirmed = 0',
            [team_id, allocated_date]
        );
        
        // Check if any rows were updated
        if (result.affectedRows === 0) {
            return res.json({ success: true, message: 'All goods already confirmed' });
        }
        
        res.json({ success: true, message: 'Allocation confirmed successfully' });
    } catch (error) {
        console.error('Confirm allocation error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
app.get('/api/allocations/confirmation-status/:teamId/:date', authMiddleware, async (req, res) => {
    try {
        const { teamId, date } = req.params;
        
        // Get ALL allocations for this team on this date
        const [results] = await pool.query(
            'SELECT confirmed FROM sales_team_allocations WHERE team_id = ? AND allocated_date = ?',
            [teamId, date]
        );
        
        // If no allocations, return false
        if (results.length === 0) {
            return res.json({ success: true, confirmed: false });
        }
        
        // Check if ALL allocations are confirmed
        const allConfirmed = results.every(row => row.confirmed === 1);
        
        res.json({ success: true, confirmed: allConfirmed });
    } catch (error) {
        console.error('Confirmation status error:', error);
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
        
        // Check if customer has outstanding credit
        if (payment_method === 'credit') {
            const [outstandingCredit] = await pool.query(
                `SELECT COUNT(*) as count FROM credit_approvals c 
                 JOIN sales_orders o ON c.order_id = o.id 
                 WHERE o.customer_name = ? AND c.is_paid = 0 AND c.status = 'approved'`,
                [customer_name]
            );
            
            if (outstandingCredit[0].count > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Customer has outstanding credit. Please settle before new credit.' 
                });
            }
        }
        
        let total_amount = 0;
        for (const item of items) total_amount += item.quantity * item.unit_price;
        
        const order_number = `SALE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const saleDate = sales_date || new Date().toISOString().split('T')[0];
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
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
                `INSERT INTO credit_approvals (order_id, requested_by, status, amount_due, due_date, is_paid)
                 VALUES (?, ?, 'pending', ?, ?, 0)`,
                [order_id, req.user.id, total_amount, credit_due_date || null]
            );
        }
        
        await connection.commit();
        res.json({ success: true, order_id, order_number, message: 'Sale recorded' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.get('/api/sales/team/:teamId/history', authMiddleware, async (req, res) => {
    try {
        const [orders] = await pool.query(
            `SELECT id, order_number, customer_name, total_amount, payment_method, payment_status, approval_status, created_at
             FROM sales_orders WHERE team_id = ? ORDER BY created_at DESC LIMIT 50`,
            [req.params.teamId]
        );
        res.json({ success: true, data: orders });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

app.get('/api/sales/order/:orderId/items', authMiddleware, async (req, res) => {
    try {
        const [items] = await pool.query(
            `SELECT oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) as total_price, p.product_name
             FROM sales_order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`,
            [req.params.orderId]
        );
        res.json({ success: true, data: items });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

app.get('/api/sales/check-submitted/:teamId/:date', authMiddleware, async (req, res) => {
    try {
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM sales_orders WHERE team_id = ? AND sales_date = ? AND submitted_for_review = 1',
            [req.params.teamId, req.params.date]
        );
        res.json({ success: true, submitted: result[0]?.count > 0 });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// CREDIT APPROVALS - CORRECTED
// ============================================================
app.get('/api/approvals/pending', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, o.payment_method, 
                    u.full_name as requested_by, c.requested_at, c.due_date
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             JOIN users u ON c.requested_by = u.id
             WHERE c.status = 'pending'`
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
                    c.status, c.is_paid, c.due_date
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

// ============================================================
// APPROVE CREDIT - CORRECTED
// ============================================================
app.post('/api/approvals/approve', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { approval_id, approved_amount } = req.body;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [approval] = await connection.query(
            'SELECT order_id FROM credit_approvals WHERE id = ?',
            [approval_id]
        );
        if (approval.length === 0) throw new Error('Approval not found');

        if (approved_amount && approved_amount > 0) {
            await connection.query(
                'UPDATE sales_orders SET total_amount = ? WHERE id = ?',
                [approved_amount, approval[0].order_id]
            );
        }

        await connection.query(
            "UPDATE credit_approvals SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?",
            [req.user.id, approval_id]
        );
        await connection.query(
            "UPDATE sales_orders SET approval_status = 'approved', payment_status = 'pending' WHERE id = ?",
            [approval[0].order_id]
        );

        await connection.commit();
        res.json({ success: true, message: 'Credit approved successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Approve credit error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// REJECT CREDIT - CORRECTED
// ============================================================
app.post('/api/approvals/reject', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { approval_id } = req.body;
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [approval] = await connection.query(
            'SELECT order_id FROM credit_approvals WHERE id = ?',
            [approval_id]
        );
        if (approval.length === 0) throw new Error('Approval not found');

        await connection.query(
            "UPDATE credit_approvals SET status = 'rejected', approved_by = ?, approved_at = NOW() WHERE id = ?",
            [req.user.id, approval_id]
        );
        await connection.query(
            "UPDATE sales_orders SET approval_status = 'rejected' WHERE id = ?",
            [approval[0].order_id]
        );

        await connection.commit();
        res.json({ success: true, message: 'Credit rejected successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Reject credit error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// ============================================================
// MARK CREDIT AS PAID - WITH PAYMENT METHOD (FIXED)
// ============================================================
app.post('/api/credit/mark-paid', authMiddleware, async (req, res) => {
    let connection;
    try {
        const { credit_id, payment_method, sales_date } = req.body;
        
        if (!payment_method) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment method is required (cash or bank_transfer)' 
            });
        }
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Get credit details - JOIN with sales_orders
        const [credit] = await connection.query(
            `SELECT c.id, c.order_id, c.amount_due, o.team_id, o.customer_name 
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             WHERE c.id = ? AND c.status = 'approved' AND c.is_paid = 0`,
            [credit_id]
        );
        
        if (credit.length === 0) {
            throw new Error('Credit not found or already paid');
        }
        
        const saleDate = sales_date || new Date().toISOString().split('T')[0];
        const orderNumber = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Create a new payment record (sales order) for the credit payment
        const [orderResult] = await connection.query(
            `INSERT INTO sales_orders 
             (order_number, team_id, customer_name, total_amount, payment_method, sales_date, created_by, approval_status, payment_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber, 
                credit[0].team_id, 
                credit[0].customer_name + ' (Credit Payment)', 
                credit[0].amount_due, 
                payment_method, 
                saleDate, 
                req.user.id, 
                'not_required', 
                'paid'
            ]
        );
        
        // Mark credit as paid
        await connection.query(
            'UPDATE credit_approvals SET is_paid = 1, payment_received_at = NOW(), status = "paid" WHERE id = ?',
            [credit_id]
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Payment of ₦${Number(credit[0].amount_due).toLocaleString()} recorded via ${payment_method}.`,
            order_id: orderResult.insertId
        });
        
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Mark paid error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});
// ============================================================
// SUBMIT DAY SALES
// ============================================================
app.post('/api/sales/submit-day', authMiddleware, async (req, res) => {
    let connection;
    try {
        const { team_id, sales_date, move_remaining_goods } = req.body;
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [remainingGoods] = await connection.query(
            `SELECT a.id, a.product_id, 
                    (a.allocated_qty - a.sold_qty - a.returned_qty) as remaining_qty
             FROM sales_team_allocations a
             WHERE a.team_id = ? AND a.allocated_date = ? AND a.status = 'active'
               AND (a.allocated_qty - a.sold_qty - a.returned_qty) > 0`,
            [team_id, sales_date]
        );
        
        const hasRemaining = remainingGoods.length > 0;
        let totalRemaining = 0;
        for (const goods of remainingGoods) {
            totalRemaining += goods.remaining_qty;
        }
        
        if (hasRemaining && move_remaining_goods === undefined) {
            await connection.rollback();
            return res.json({ 
                success: false, 
                requires_action: true,
                message: `You have ${totalRemaining} units of unsold goods. Move to warehouse or keep?`,
                total_remaining: totalRemaining
            });
        }
        
        await connection.query(
            'UPDATE sales_orders SET submitted_for_review = 1 WHERE team_id = ? AND sales_date = ?',
            [team_id, sales_date]
        );
        
        if (move_remaining_goods === true) {
            for (const goods of remainingGoods) {
                await connection.query(
                    'UPDATE sales_team_allocations SET returned_qty = returned_qty + ? WHERE id = ?',
                    [goods.remaining_qty, goods.id]
                );
            }
            await connection.commit();
            res.json({ 
                success: true, 
                message: `${totalRemaining} units pending manager approval.`,
                pending_approval: true
            });
        } else {
            await connection.commit();
            res.json({ 
                success: true, 
                message: `${totalRemaining} units kept for continued selling.`,
                kept: true
            });
        }
        
    } catch (error) { 
        if (connection) await connection.rollback();
        console.error('Submit day error:', error);
        res.status(500).json({ success: false, message: error.message }); 
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// PENDING RETURNS
// ============================================================
app.get('/api/sales/pending-submissions', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [items] = await pool.query(
            `SELECT 
                a.id as return_id,
                st.team_name,
                'Returned Goods' as customer_name,
                p.product_name,
                a.returned_qty as quantity,
                (a.returned_qty * p.unit_cost) as amount,
                'return' as type,
                a.allocated_date,
                a.status
             FROM sales_team_allocations a
             JOIN sales_teams st ON a.team_id = st.id
             JOIN products p ON a.product_id = p.id
             WHERE a.returned_qty > 0
               AND a.status = 'active'
             ORDER BY a.allocated_date DESC`
        );
        
        res.json({ success: true, data: items });
    } catch (error) { 
        console.error('Get pending returns error:', error);
        res.status(500).json({ success: false, message: error.message }); 
    }
});

// ============================================================
// CONFIRM RETURN
// ============================================================
app.post('/api/sales/confirm-return', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    let connection;
    try {
        const { item_id, action } = req.body;
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [allocation] = await connection.query(
            `SELECT a.id, a.product_id, a.returned_qty, a.team_id, a.allocated_date, p.unit_cost
             FROM sales_team_allocations a
             JOIN products p ON a.product_id = p.id
             WHERE a.id = ? AND a.returned_qty > 0`,
            [item_id]
        );
        
        if (allocation.length === 0) {
            await connection.rollback();
            return res.json({ success: false, message: 'No returned goods found' });
        }
        
        const item = allocation[0];
        
        if (action === 'accept') {
            await connection.query(
                'UPDATE products SET current_qty = current_qty + ? WHERE id = ?',
                [item.returned_qty, item.product_id]
            );
            
            await connection.query(
                'UPDATE sales_team_allocations SET status = ? WHERE id = ?',
                ['closed', item_id]
            );
            
            await connection.query(
                `INSERT INTO stock_transactions 
                 (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, created_by, notes)
                 VALUES ('return_from_team', ?, ?, ?, 'manager_acceptance', ?, ?)`,
                [item.product_id, item.returned_qty, item.unit_cost, req.user.id, `Manager accepted return of ${item.returned_qty} units`]
            );
            
            await connection.commit();
            res.json({ 
                success: true, 
                message: `${item.returned_qty} units accepted and added to warehouse.`
            });
            
        } else if (action === 'reject') {
            await connection.query(
                'UPDATE sales_team_allocations SET returned_qty = 0 WHERE id = ?',
                [item_id]
            );
            
            await connection.query(
                'UPDATE sales_team_allocations SET status = ? WHERE id = ?',
                ['active', item_id]
            );
            
            await connection.query(
                `UPDATE sales_orders SET submitted_for_review = 0, manager_confirmed = 0 
                 WHERE team_id = ? AND sales_date = ?`,
                [item.team_id, item.allocated_date]
            );
            
            await connection.commit();
            res.json({ 
                success: true, 
                message: `${item.returned_qty} units returned to sales team.`
            });
        } else {
            throw new Error('Invalid action');
        }
    } catch (error) { 
        if (connection) await connection.rollback();
        console.error('Confirm return error:', error);
        res.status(500).json({ success: false, message: error.message }); 
    } finally {
        if (connection) connection.release();
    }
});
// ============================================================
// RETURNS TRACKING - GET TEAM RETURNS BY DATE
// ============================================================
app.get('/api/sales/team-returns', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [results] = await pool.query(
            `SELECT 
                st.team_name,
                CAST(COALESCE(SUM(a.allocated_qty), 0) AS UNSIGNED) as allocated_qty,
                CAST(COALESCE(SUM(a.sold_qty), 0) AS UNSIGNED) as sold_qty,
                CAST(COALESCE(SUM(a.returned_qty), 0) AS UNSIGNED) as returned_qty,
                (SELECT p.product_name FROM sales_team_allocations a2 
                 JOIN products p ON a2.product_id = p.id 
                 WHERE a2.team_id = a.team_id AND a2.allocated_date = ? 
                 ORDER BY a2.returned_qty DESC LIMIT 1) as top_returned_product
             FROM sales_team_allocations a
             JOIN sales_teams st ON a.team_id = st.id
             WHERE a.allocated_date = ?
             GROUP BY a.team_id, st.team_name
             ORDER BY st.team_name`,
            [date, date]
        );
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Team returns error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// RETURNS TRACKING - GET RETURNS DETAILS BY DATE
// ============================================================
app.get('/api/sales/returns-details', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [results] = await pool.query(
            `SELECT 
                st.team_name,
                p.product_name,
                CAST(a.returned_qty AS UNSIGNED) as returned_qty,
                CAST((a.returned_qty * p.unit_cost) AS UNSIGNED) as amount,
                a.allocated_date
             FROM sales_team_allocations a
             JOIN sales_teams st ON a.team_id = st.id
             JOIN products p ON a.product_id = p.id
             WHERE a.allocated_date = ?
               AND a.returned_qty > 0
             ORDER BY st.team_name, p.product_name`,
            [date]
        );
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Returns details error:', error);
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
                    COALESCE(SUM(CASE WHEN o.payment_method IN ('cash', 'bank_transfer') THEN o.total_amount ELSE 0 END), 0) as total_sales,
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
        console.error('Daily report error:', error);
        res.json({ success: true, date: new Date().toISOString().split('T')[0], teams: [] });
    }
});
// ============================================================
// MANAGER DASHBOARD SUMMARY
// ============================================================
app.get('/api/manager/dashboard-summary', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [totalProducts] = await pool.query('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
        const [warehouseValue] = await pool.query('SELECT COALESCE(SUM(current_qty * unit_cost), 0) as value FROM products WHERE is_active = 1');
        const [todaySales] = await pool.query('SELECT COALESCE(SUM(total_amount), 0) as total_value FROM sales_orders WHERE sales_date = ?', [today]);
        const [todayUnits] = await pool.query(`SELECT COALESCE(SUM(soi.quantity), 0) as total_units FROM sales_orders o JOIN sales_order_items soi ON o.id = soi.order_id WHERE o.sales_date = ?`, [today]);
        
        res.json({ success: true, data: {
            total_products: totalProducts[0]?.count || 0,
            warehouse_value: warehouseValue[0]?.value || 0,
            today_sales_value: todaySales[0]?.total_value || 0,
            today_units_sold: todayUnits[0]?.total_units || 0
        }});
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// DAILY CLOSURE
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
                 VALUES ('return_from_team', ?, ?, (SELECT unit_cost FROM products WHERE id = ?), 'daily_closure', ?, ?)`,
                [item.product_id, item.to_return, item.product_id, item.team_id, req.user.id]
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
        console.error('Daily closure error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// ADMIN PRODUCT MANAGEMENT
// ============================================================
app.get('/api/admin/products', superAdminMiddleware, async (req, res) => {
    try {
        const search = req.query.search || '';
        let query = 'SELECT id, product_name, current_qty, unit_cost, selling_price, min_stock_level, is_active FROM products WHERE 1=1';
        let params = [];

        if (search) {
            query += ' AND product_name LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY product_name';
        
        const [products] = await pool.query(query, params);
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/product', superAdminMiddleware, async (req, res) => {
    try {
        const { product_name, current_qty, unit_cost, selling_price, min_stock_level } = req.body;
        
        if (!product_name) {
            return res.status(400).json({ success: false, message: 'Product name required' });
        }

        const [result] = await pool.query(
            `INSERT INTO products (product_name, current_qty, unit_cost, selling_price, min_stock_level, is_active) 
             VALUES (?, ?, ?, ?, ?, 1)`,
            [product_name, current_qty || 0, unit_cost || 0, selling_price || 0, min_stock_level || 50]
        );

        res.json({ success: true, id: result.insertId, message: 'Product added successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.put('/api/admin/product/:id', superAdminMiddleware, async (req, res) => {
    try {
        const { product_name, current_qty, unit_cost, selling_price, min_stock_level, is_active } = req.body;
        
        await pool.query(
            `UPDATE products SET 
                product_name = ?, 
                current_qty = ?, 
                unit_cost = ?, 
                selling_price = ?, 
                min_stock_level = ?, 
                is_active = ? 
             WHERE id = ?`,
            [product_name, current_qty, unit_cost, selling_price, min_stock_level, is_active, req.params.id]
        );

        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/product/:id', superAdminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/products/bulk-delete', superAdminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No products selected' });
        }
        
        const placeholders = ids.map(() => '?').join(',');
        await pool.query(`DELETE FROM products WHERE id IN (${placeholders})`, ids);
        
        res.json({ success: true, message: `${ids.length} products deleted successfully` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/adjust-stock', superAdminMiddleware, async (req, res) => {
    let connection;
    try {
        const { product_id, adjustment, reason } = req.body;
        
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        const [product] = await connection.query('SELECT product_name, current_qty FROM products WHERE id = ?', [product_id]);
        if (product.length === 0) {
            throw new Error('Product not found');
        }
        
        const newQuantity = product[0].current_qty + adjustment;
        if (newQuantity < 0) {
            throw new Error('Stock cannot be negative');
        }
        
        await connection.query('UPDATE products SET current_qty = ? WHERE id = ?', [newQuantity, product_id]);
        
        await connection.query(
            `INSERT INTO stock_transactions 
             (transaction_type, product_id, quantity_change, unit_cost_at_time, reference_type, notes, created_by) 
             VALUES (?, ?, ?, (SELECT unit_cost FROM products WHERE id = ?), ?, ?, ?)`,
            ['manual_adjustment', product_id, adjustment, product_id, 'admin_adjustment', reason, req.user.username]
        );
        
        await connection.commit();
        
        res.json({ 
            success: true, 
            message: `Stock adjusted: ${adjustment > 0 ? '+' : ''}${adjustment} units. New quantity: ${newQuantity}` 
        });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/admin/upload-products', superAdminMiddleware, upload.single('file'), async (req, res) => {
    let connection;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            return res.status(400).json({ success: false, message: 'Excel file is empty' });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        let added = 0, updated = 0, errors = [];

        for (const row of data) {
            try {
                const productName = row.product_name || row.Product_Name || row.name;
                const quantity = parseInt(row.current_qty || row.Quantity || row.qty) || 0;
                const unitCost = parseFloat(row.unit_cost || row.Cost || row.cost) || 0;
                const sellingPrice = parseFloat(row.selling_price || row.Price || row.price) || 0;
                const minStock = parseInt(row.min_stock_level || row.MinStock) || 50;

                if (!productName) {
                    errors.push(`Missing product name in row: ${JSON.stringify(row)}`);
                    continue;
                }

                const [existing] = await connection.query('SELECT id FROM products WHERE product_name = ?', [productName]);

                if (existing.length > 0) {
                    await connection.query(
                        `UPDATE products SET current_qty = ?, unit_cost = ?, selling_price = ?, min_stock_level = ? WHERE id = ?`,
                        [quantity, unitCost, sellingPrice, minStock, existing[0].id]
                    );
                    updated++;
                } else {
                    await connection.query(
                        `INSERT INTO products (product_name, current_qty, unit_cost, selling_price, min_stock_level, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
                        [productName, quantity, unitCost, sellingPrice, minStock]
                    );
                    added++;
                }
            } catch (rowError) {
                errors.push(`Error processing row: ${rowError.message}`);
            }
        }

        await connection.commit();
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            message: `Upload complete: ${added} new, ${updated} updated`,
            errors: errors.length > 0 ? errors : null
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// ============================================================
// ADMIN USER MANAGEMENT
// ============================================================
app.get('/api/admin/users', superAdminMiddleware, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id, is_active, created_at FROM users'
        );
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/user', superAdminMiddleware, async (req, res) => {
    try {
        const { username, password_hash, full_name, email, role, team_id } = req.body;
        
        if (!username || !password_hash) {
            return res.status(400).json({ success: false, message: 'Username and password required' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO users (username, password_hash, full_name, email, role, team_id, is_active) 
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [username, password_hash, full_name || username, email || '', role || 'sales_rep', team_id || null]
        );
        
        res.json({ success: true, id: result.insertId, message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/admin/user/:id/reset-password', superAdminMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', ['password123', req.params.id]);
        res.json({ success: true, message: 'Password reset to: password123' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/user/:id', superAdminMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'User deactivated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// ADMIN SYSTEM INFO
// ============================================================
app.get('/api/admin/system-info', superAdminMiddleware, async (req, res) => {
    try {
        const [productCount] = await pool.query('SELECT COUNT(*) as count FROM products');
        const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
        const [orderCount] = await pool.query('SELECT COUNT(*) as count FROM sales_orders');
        
        res.json({
            success: true,
            data: {
                total_products: productCount[0].count,
                total_users: userCount[0].count,
                total_orders: orderCount[0].count
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// ============================================================
// MANAGER PERFORMANCE - DASHBOARD SUMMARY
// ============================================================
app.get('/api/manager/dashboard-summary', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [sales] = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM sales_orders WHERE sales_date = ?',
            [date]
        );
        
        const [orders] = await pool.query(
            'SELECT COUNT(*) as count FROM sales_orders WHERE sales_date = ?',
            [date]
        );
        
        const [units] = await pool.query(
            `SELECT COALESCE(SUM(oi.quantity), 0) as total 
             FROM sales_orders o
             JOIN sales_order_items oi ON o.id = oi.order_id
             WHERE o.sales_date = ?`,
            [date]
        );
        
        res.json({
            success: true,
            data: {
                total_sales: sales[0]?.total || 0,
                total_orders: orders[0]?.count || 0,
                total_units: units[0]?.total || 0,
                date: date
            }
        });
    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// MANAGER PERFORMANCE - TEAM PERFORMANCE
// ============================================================
app.get('/api/manager/team-performance', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [results] = await pool.query(
            `SELECT 
                st.team_name,
                COUNT(DISTINCT o.id) as orders,
                COALESCE(SUM(oi.quantity), 0) as total_units,
                COALESCE(SUM(o.total_amount), 0) as total_sales
             FROM sales_teams st
             LEFT JOIN sales_orders o ON st.id = o.team_id AND o.sales_date = ?
             LEFT JOIN sales_order_items oi ON o.id = oi.order_id
             GROUP BY st.id, st.team_name
             ORDER BY total_sales DESC`,
            [date]
        );
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Team performance error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
// MANAGER PERFORMANCE - PRODUCT PERFORMANCE
// ============================================================
app.get('/api/manager/product-performance', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        const [results] = await pool.query(
            `SELECT 
                p.product_name,
                COALESCE(SUM(oi.quantity), 0) as total_sold,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_revenue
             FROM products p
             LEFT JOIN sales_order_items oi ON p.id = oi.product_id
             LEFT JOIN sales_orders o ON oi.order_id = o.id AND o.sales_date = ?
             GROUP BY p.id, p.product_name
             HAVING total_sold > 0
             ORDER BY total_sold DESC
             LIMIT 20`,
            [date]
        );
        
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('Product performance error:', error);
        res.status(500).json({ success: false, message: error.message });
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
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`📱 App URL: http://localhost:${PORT}`);
        console.log(`💚 Health check: http://localhost:${PORT}/health`);
    });
}

startServer();
