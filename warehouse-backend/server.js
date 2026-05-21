// server.js - Database Test Version
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool, testConnection } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check with database status
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

// Test database query endpoint
app.get('/api/db-test', async (req, res) => {
    try {
        // Test connection and query
        const [tables] = await pool.query('SHOW TABLES');
        const [productCount] = await pool.query('SELECT COUNT(*) as count FROM products');
        
        res.json({
            success: true,
            message: 'Database connected successfully',
            tables: tables.length,
            products: productCount[0].count
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database error',
            error: error.message
        });
    }
});

// Login endpoint (database version)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id FROM users WHERE username = ?',
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
            user: user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// Products endpoint (database version)
app.get('/api/products', async (req, res) => {
    try {
        const [products] = await pool.query('SELECT id, product_name, current_qty, unit_cost, selling_price FROM products WHERE is_active = 1');
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Team allocations endpoint
app.get('/api/sales/team/:teamId/allocations', async (req, res) => {
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

// Create sale endpoint
app.post('/api/sales', async (req, res) => {
    try {
        const { team_id, customer_name, customer_phone, items, payment_method, sales_date } = req.body;
        
        let total_amount = 0;
        for (const item of items) {
            total_amount += item.quantity * item.unit_price;
        }
        
        const order_number = `SALE-${Date.now()}`;
        
        const [orderResult] = await pool.query(
            `INSERT INTO sales_orders 
             (order_number, team_id, customer_name, customer_phone, total_amount, payment_method, sales_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [order_number, team_id, customer_name, customer_phone, total_amount, payment_method, sales_date, 1]
        );
        
        res.json({
            success: true,
            order_id: orderResult.insertId,
            order_number: order_number,
            message: 'Sale recorded'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Pending approvals endpoint
app.get('/api/approvals/pending', async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount 
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             WHERE c.status = 'pending'`
        );
        res.json({ success: true, data: approvals });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// Daily report endpoint
app.get('/api/reports/daily', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [report] = await pool.query(
            `SELECT t.team_name,
                    COUNT(DISTINCT o.id) as num_orders,
                    SUM(o.total_amount) as total_sales
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

// Daily close endpoint
app.post('/api/daily/close', (req, res) => {
    res.json({ success: true, message: 'Day closed successfully' });
});

// Sales history endpoint
app.get('/api/sales/team/:teamId/history', async (req, res) => {
    try {
        const { teamId } = req.params;
        
        const [orders] = await pool.query(
            `SELECT id, order_number, customer_name, total_amount, payment_method, created_at
             FROM sales_orders
             WHERE team_id = ?
             ORDER BY created_at DESC
             LIMIT 20`,
            [teamId]
        );
        
        res.json({ success: true, data: orders });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
});

// Credit requests endpoint
app.get('/api/approvals/my-requests', (req, res) => {
    res.json({ success: true, data: [] });
});

// Start server
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
        console.log(`📍 DB Test: https://warehouse-backend-api-2fye.onrender.com/api/db-test`);
    });
}

startServer();
