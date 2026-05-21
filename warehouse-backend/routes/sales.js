// routes/sales.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Get team's allocated stock for today
router.get('/team/:teamId/allocations', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        const today = new Date().toISOString().split('T')[0];

        // Verify user has access to this team
        if (req.user.role === 'sales_rep' && req.user.team_id != teamId) {
            return res.status(403).json({
                success: false,
                message: 'You can only view your own team allocations'
            });
        }

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
        res.status(500).json({
            success: false,
            message: 'Failed to fetch allocations',
            error: error.message
        });
    }
});

// Create a new sale
router.post('/', authMiddleware, async (req, res) => {
    try {
        const {
            team_id,
            customer_name,
            customer_phone,
            items,
            payment_method,
            sales_date,
            credit_due_date,
            credit_notes
        } = req.body;

        // Validate required fields
        if (!team_id || !customer_name || !items || !items.length || !payment_method || !sales_date) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: team_id, customer_name, items, payment_method, sales_date'
            });
        }

        // Verify sales rep belongs to this team
        if (req.user.role === 'sales_rep' && req.user.team_id != team_id) {
            return res.status(403).json({
                success: false,
                message: 'You can only create sales for your own team'
            });
        }

        // Calculate total amount
        let total_amount = 0;
        for (const item of items) {
            total_amount += item.quantity * item.unit_price;
        }

        // Generate unique order number
        const order_number = `SALE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert sales order
            const [orderResult] = await connection.query(
                `INSERT INTO sales_orders 
                 (order_number, team_id, customer_name, customer_phone, total_amount, 
                  payment_method, sales_date, created_by, approval_status, payment_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    order_number, team_id, customer_name, customer_phone, total_amount,
                    payment_method, sales_date, req.user.id,
                    payment_method === 'credit' ? 'pending' : 'not_required',
                    payment_method === 'credit' ? 'pending' : 'pending'
                ]
            );

            const order_id = orderResult.insertId;

            // Insert order items
            for (const item of items) {
                // Get cost of goods
                const [productData] = await connection.query(
                    'SELECT unit_cost FROM products WHERE id = ?',
                    [item.product_id]
                );
                const cost_of_goods = productData[0]?.unit_cost || 0;

                await connection.query(
                    `INSERT INTO sales_order_items 
                     (order_id, product_id, quantity, unit_price, cost_of_goods)
                     VALUES (?, ?, ?, ?, ?)`,
                    [order_id, item.product_id, item.quantity, item.unit_price, cost_of_goods]
                );
            }

            // Handle based on payment method
            if (payment_method === 'credit') {
                // Create credit approval record
                await connection.query(
                    `INSERT INTO credit_approvals 
                     (order_id, requested_by, status, amount_due, due_date, notes)
                     VALUES (?, ?, 'pending', ?, ?, ?)`,
                    [order_id, req.user.id, total_amount, credit_due_date || null, credit_notes || null]
                );

                await connection.commit();

                res.json({
                    success: true,
                    order_id,
                    order_number,
                    approval_status: 'pending',
                    message: 'Credit sale created. Waiting for manager approval.'
                });
            } else {
                // Create payment reconciliation record (pending)
                await connection.query(
                    `INSERT INTO payment_reconciliations 
                     (order_id, payment_method, amount, reconciliation_status)
                     VALUES (?, ?, ?, 'pending')`,
                    [order_id, payment_method, total_amount]
                );

                await connection.commit();

                res.json({
                    success: true,
                    order_id,
                    order_number,
                    payment_status: 'pending_reconciliation',
                    message: `Sale recorded. ${payment_method === 'cash' ? 'Cash needs to be counted.' : 'Bank transfer needs confirmation.'}`
                });
            }
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Sale creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create sale',
            error: error.message
        });
    }
});

// Get team's sales history
router.get('/team/:teamId/history', authMiddleware, async (req, res) => {
    try {
        const { teamId } = req.params;
        const { date, limit = 50 } = req.query;

        let query = `
            SELECT o.id, o.order_number, o.customer_name, o.total_amount, 
                   o.payment_method, o.payment_status, o.approval_status, o.created_at
            FROM sales_orders o
            WHERE o.team_id = ?
        `;
        const params = [teamId];

        if (date) {
            query += ' AND o.sales_date = ?';
            params.push(date);
        }

        query += ' ORDER BY o.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const [orders] = await pool.query(query, params);

        // Get items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                `SELECT oi.quantity, oi.unit_price, oi.total_price, p.product_name
                 FROM sales_order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?`,
                [order.id]
            );
            order.items = items;
        }

        res.json({ success: true, data: orders });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sales history',
            error: error.message
        });
    }
});

module.exports = router;
