// routes/approvals.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Get pending credit approvals (manager only)
router.get('/pending', authMiddleware, requireRole(['warehouse_manager', 'chief_accountant']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.customer_phone, 
                    o.total_amount, u.full_name as requested_by, c.requested_at, 
                    c.due_date, c.notes, t.team_name
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             JOIN users u ON c.requested_by = u.id
             JOIN sales_teams t ON o.team_id = t.id
             WHERE c.status = 'pending'
             ORDER BY c.requested_at ASC`
        );

        res.json({ success: true, data: approvals });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending approvals',
            error: error.message
        });
    }
});

// Approve or reject credit (manager only)
router.put('/:id', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason } = req.body;

        if (!status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be "approved" or "rejected"'
            });
        }

        // Get approval details
        const [approvals] = await pool.query(
            `SELECT c.order_id, o.team_id
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             WHERE c.id = ?`,
            [id]
        );

        if (approvals.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Credit approval not found'
            });
        }

        const { order_id, team_id } = approvals[0];

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            if (status === 'approved') {
                // Get order items
                const [items] = await connection.query(
                    `SELECT product_id, quantity, cost_of_goods
                     FROM sales_order_items
                     WHERE order_id = ?`,
                    [order_id]
                );

                // Update allocation sold_qty for each item
                for (const item of items) {
                    await connection.query(
                        `UPDATE sales_team_allocations 
                         SET sold_qty = sold_qty + ?
                         WHERE team_id = ? AND product_id = ? AND allocated_date = CURDATE()`,
                        [item.quantity, team_id, item.product_id]
                    );

                    // Record stock transaction
                    await connection.query(
                        `INSERT INTO stock_transactions 
                         (transaction_type, product_id, quantity_change, unit_cost_at_time, 
                          reference_type, reference_id, team_id, created_by, notes)
                         VALUES ('sale_out', ?, ?, ?, 'sales_order', ?, ?, ?, 'Credit sale approved')`,
                        [item.product_id, -item.quantity, item.cost_of_goods, order_id, team_id, req.user.id]
                    );
                }

                // Update approval status
                await connection.query(
                    `UPDATE credit_approvals 
                     SET status = 'approved', approved_by = ?, approved_at = NOW()
                     WHERE id = ?`,
                    [req.user.id, id]
                );

                // Update sales order
                await connection.query(
                    `UPDATE sales_orders 
                     SET approval_status = 'approved', payment_status = 'completed',
                         approved_by = ?, approved_at = NOW()
                     WHERE id = ?`,
                    [req.user.id, order_id]
                );
            } else {
                // Rejected - just update status
                await connection.query(
                    `UPDATE credit_approvals 
                     SET status = 'rejected', approved_by = ?, approved_at = NOW(), notes = ?
                     WHERE id = ?`,
                    [req.user.id, rejection_reason || 'No reason provided', id]
                );

                await connection.query(
                    `UPDATE sales_orders 
                     SET approval_status = 'rejected', rejection_reason = ?
                     WHERE id = ?`,
                    [rejection_reason || 'No reason provided', order_id]
                );
            }

            await connection.commit();

            res.json({
                success: true,
                message: `Credit ${status} successfully`
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Credit approval error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process credit approval',
            error: error.message
        });
    }
});

// Get credit requests by team (sales rep)
router.get('/my-requests', authMiddleware, requireRole(['sales_rep']), async (req, res) => {
    try {
        const [requests] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, 
                    c.status, c.requested_at, c.approved_at, c.due_date
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             WHERE o.team_id = ? AND o.created_by = ?
             ORDER BY c.requested_at DESC`,
            [req.user.team_id, req.user.id]
        );

        res.json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch credit requests',
            error: error.message
        });
    }
});

module.exports = router;