// server.js - SIMPLIFIED VERSION using status column only
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool, testConnection } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Health check
app.get('/health', async (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Login
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
        res.json({ success: true, token: token, user: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pending approvals
app.get('/api/approvals/pending', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, 
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

// Approve credit - USING status column
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
        
        // USING status column - this is safe because it exists
        await connection.query(
            'UPDATE credit_approvals SET status = "approved", approved_by = ?, approved_at = NOW() WHERE id = ?',
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

// Reject credit - USING status column
app.post('/api/approvals/reject', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { approval_id } = req.body;
        
        const [approval] = await pool.query('SELECT order_id FROM credit_approvals WHERE id = ?', [approval_id]);
        if (approval.length === 0) throw new Error('Approval not found');
        const order_id = approval[0].order_id;
        
        await pool.query(
            'UPDATE credit_approvals SET status = "rejected", approved_by = ?, approved_at = NOW() WHERE id = ?',
            [req.user.id, approval_id]
        );
        
        await pool.query(
            'UPDATE sales_orders SET approval_status = "rejected" WHERE id = ?',
            [order_id]
        );
        
        res.json({ success: true, message: 'Credit rejected successfully' });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start server
async function startServer() {
    const dbConnected = await testConnection();
    if (dbConnected) {
        console.log('Database connected. Starting server...');
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log('Server running on port ' + PORT);
        console.log('Health: https://warehouse-backend-api-2fye.onrender.com/health');
    });
}

startServer();
