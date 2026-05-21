// server.js - Working version without database
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Login endpoint (no database required)
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log(`Login attempt: ${username}`);
    
    // Hardcoded valid users for testing
    const validUsers = {
        'warehouse_mgr': { id: 1, username: 'warehouse_mgr', full_name: 'Emeka Okafor', role: 'warehouse_manager', team_id: null },
        'alpha_lead': { id: 2, username: 'alpha_lead', full_name: 'Chidi Okonkwo', role: 'sales_rep', team_id: 1 }
    };
    
    if (validUsers[username] && password === 'password123') {
        const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
        res.json({
            success: true,
            token: token,
            user: validUsers[username]
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});

// Products endpoint (mock data)
app.get('/api/products', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, product_name: 'Premium Rice 5kg', current_qty: 500, unit_cost: 3500, selling_price: 4200 },
            { id: 2, product_name: 'Vegetable Oil 2L', current_qty: 300, unit_cost: 1800, selling_price: 2300 },
            { id: 3, product_name: 'Tomato Paste 70g', current_qty: 1000, unit_cost: 150, selling_price: 220 }
        ]
    });
});

// Team allocations endpoint (mock data)
app.get('/api/sales/team/:teamId/allocations', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, product_name: 'Premium Rice 5kg', remaining_qty: 40, selling_price: 4200 },
            { id: 2, product_name: 'Vegetable Oil 2L', remaining_qty: 30, selling_price: 2300 }
        ]
    });
});

// Create sale endpoint (mock)
app.post('/api/sales', (req, res) => {
    const { customer_name, items, payment_method } = req.body;
    const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const order_number = `SALE-${Date.now()}`;
    
    res.json({
        success: true,
        order_id: Date.now(),
        order_number: order_number,
        message: payment_method === 'credit' ? 'Credit sale pending approval' : 'Sale recorded'
    });
});

// Pending approvals endpoint
app.get('/api/approvals/pending', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, order_number: 'SALE-001', customer_name: 'XYZ Supermarket', total_amount: 168000, requested_by: 'Amara Eze' }
        ]
    });
});

// Approve credit endpoint
app.put('/api/approvals/:id', (req, res) => {
    const { status } = req.body;
    res.json({ success: true, message: `Credit ${status}` });
});

// Daily report endpoint
app.get('/api/reports/daily', (req, res) => {
    res.json({
        success: true,
        date: new Date().toISOString().split('T')[0],
        teams: [
            { team_name: 'Alpha Team', num_orders: 5, total_sales: 210000, cash_sales: 42000, transfer_sales: 0, credit_sales: 168000 },
            { team_name: 'Beta Team', num_orders: 3, total_sales: 168000, cash_sales: 0, transfer_sales: 0, credit_sales: 168000 }
        ]
    });
});

// Daily close endpoint
app.post('/api/daily/close', (req, res) => {
    res.json({ success: true, message: 'Day closed successfully' });
});

// Sales history endpoint
app.get('/api/sales/team/:teamId/history', (req, res) => {
    res.json({
        success: true,
        data: [
            { id: 1, order_number: 'SALE-001', customer_name: 'Test Customer', total_amount: 42000, payment_method: 'cash', payment_status: 'completed', created_at: new Date().toISOString(), items: [{ product_name: 'Premium Rice 5kg', quantity: 10, total_price: 42000 }] }
        ]
    });
});

// Credit requests endpoint
app.get('/api/approvals/my-requests', (req, res) => {
    res.json({
        success: true,
        data: []
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 Health: https://warehouse-backend-api-2fye.onrender.com/health`);
});
