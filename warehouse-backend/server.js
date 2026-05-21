// server.js - Complete backend for Warehouse Stock System
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================
// MOCK DATA (Temporary - matches your frontend demo data)
// ============================================================
const mockProducts = [
    { id: 1, sku: 'RICE-001', product_name: 'Premium Rice 5kg', current_qty: 500, unit_cost: 3500, selling_price: 4200, total_value: 1750000 },
    { id: 2, sku: 'OIL-001', product_name: 'Vegetable Oil 2L', current_qty: 300, unit_cost: 1800, selling_price: 2300, total_value: 540000 },
    { id: 3, sku: 'TOMATO-001', product_name: 'Tomato Paste 70g', current_qty: 1000, unit_cost: 150, selling_price: 220, total_value: 150000 }
];

const mockAllocations = [
    { product_id: 1, product_name: 'Premium Rice 5kg', allocated_qty: 50, sold_qty: 10, remaining_qty: 40, selling_price: 4200 },
    { product_id: 2, product_name: 'Vegetable Oil 2L', allocated_qty: 30, sold_qty: 0, remaining_qty: 30, selling_price: 2300 }
];

const mockPendingApprovals = [
    { id: 1, order_number: 'SALE-002', customer_name: 'XYZ Supermarket', total_amount: 168000, requested_by: 'Amara Eze', requested_at: new Date().toISOString() }
];

const mockSalesHistory = [
    { id: 1, order_number: 'SALE-001', customer_name: 'Mrs. Grace Okoro', total_amount: 42000, payment_method: 'cash', created_at: new Date().toISOString() }
];

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================
// AUTHENTICATION
// ============================================================
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    const validUsers = {
        'warehouse_mgr': { id: 1, username: 'warehouse_mgr', full_name: 'Emeka Okafor', role: 'warehouse_manager', team_id: null },
        'alpha_lead': { id: 4, username: 'alpha_lead', full_name: 'Chidi Okonkwo', role: 'sales_rep', team_id: 1 }
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

// ============================================================
// PRODUCTS
// ============================================================
app.get('/api/products', (req, res) => {
    res.json({ success: true, data: mockProducts });
});

// ============================================================
// TEAM ALLOCATIONS
// ============================================================
app.get('/api/sales/team/:teamId/allocations', (req, res) => {
    res.json({ success: true, data: mockAllocations });
});

// ============================================================
// CREATE SALE
// ============================================================
app.post('/api/sales', (req, res) => {
    const { customer_name, items, payment_method } = req.body;
    const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const order_number = `SALE-${Date.now()}`;
    
    if (payment_method === 'credit') {
        res.json({
            success: true,
            order_id: Date.now(),
            order_number: order_number,
            approval_status: 'pending',
            message: 'Credit sale created. Waiting for manager approval.'
        });
    } else {
        res.json({
            success: true,
            order_id: Date.now(),
            order_number: order_number,
            payment_status: 'pending_reconciliation',
            message: `Sale recorded. ${payment_method === 'cash' ? 'Cash needs to be counted.' : 'Bank transfer needs confirmation.'}`
        });
    }
});

// ============================================================
// PENDING APPROVALS
// ============================================================
app.get('/api/approvals/pending', (req, res) => {
    res.json({ success: true, data: mockPendingApprovals });
});

// ============================================================
// APPROVE CREDIT
// ============================================================
app.put('/api/approvals/:id', (req, res) => {
    const { status } = req.body;
    res.json({ success: true, message: `Credit ${status} successfully` });
});

// ============================================================
// PENDING RECONCILIATIONS
// ============================================================
app.get('/api/reconciliations/pending', (req, res) => {
    res.json({ success: true, data: [] });
});

// ============================================================
// CONFIRM PAYMENT
// ============================================================
app.put('/api/reconciliations/cash/:id', (req, res) => {
    res.json({ success: true, message: 'Cash payment confirmed. Stock deducted.' });
});

// ============================================================
// DAILY REPORT
// ============================================================
app.get('/api/reports/daily', (req, res) => {
    const report = [
        { team_name: 'Alpha Team', num_orders: 5, total_sales: 210000 },
        { team_name: 'Beta Team', num_orders: 3, total_sales: 168000 },
        { team_name: 'Gamma Team', num_orders: 0, total_sales: 0 },
        { team_name: 'Delta Team', num_orders: 0, total_sales: 0 }
    ];
    res.json({ success: true, date: new Date().toISOString().split('T')[0], teams: report });
});

// ============================================================
// DAILY CLOSURE
// ============================================================
app.post('/api/daily/close', (req, res) => {
    res.json({ success: true, message: 'Day closed successfully' });
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`🔐 API Base: http://localhost:${PORT}/api`);
});
