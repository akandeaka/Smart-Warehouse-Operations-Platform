// routes/reconciliations.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Get pending reconciliations (accountant/manager)
router.get('/pending', authMiddleware, requireRole(['warehouse_manager', 'chief_accountant']), async (req, res) => {
    try {
        const [pending] = await pool.query(
            `SELECT p.id, o.order_number, o.customer_name, o.total_amount, 
                    p.payment_method, p.reconciliation_status, o.created_at,
                    t.team_name
             FROM payment_reconciliations p
             JOIN sales_orders o ON p.order_id = o.id
             JOIN sales_teams t ON o.team_id = t.id
             WHERE p.reconciliation_status = 'pending'
             ORDER BY o.created_at ASC`
        );

        res.json({ success: true, data: pending });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending reconciliations',
            error: error.message
        });
    }
});

// Confirm cash payment
router.put('/cash/:id', authMiddleware, requireRole(['warehouse_manager', 'chief_accountant']), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount_counted, notes } = req.body;

        // Get reconciliation details
        const [reconciliations] = await pool.query(
            `SELECT p.order_id, p.amount, o.team_id
             FROM payment_reconciliations p
             JOIN sales_orders o ON p.order_id = o.id
             WHERE p.id = ? AND p.payment_method = 'cash'`,
            [id]
        );

        if (reconciliations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cash reconciliation not found'
            });
        }

        const { order_id, amount, team_id } = reconciliations[0];

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Update reconciliation status
            await connection.query(
                `UPDATE payment_reconciliations 
                 SET reconciliation_status = 'confirmed', 
                     cash_counter = ?, cash_counted_at = NOW(),
                     reconciled_at = NOW(), notes = ?
                 WHERE id = ?`,
                [req.user.id, notes || `Cash counted: ${amount_counted || amount}`, id]
            );

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
                     VALUES ('sale_out', ?, ?, ?, 'sales_order', ?, ?, ?, 'Cash sale confirmed')`,
                    [item.product_id, -item.quantity, item.cost_of_goods, order_id, team_id, req.user.id]
                );
            }

            // Update sales order
            await connection.query(
                `UPDATE sales_orders 
                 SET payment_status = 'reconciled'
                 WHERE id = ?`,
                [order_id]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Cash payment confirmed. Stock deducted.'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Cash reconciliation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to confirm cash payment',
            error: error.message
        });
    }
});

// Confirm bank transfer
router.put('/transfer/:id', authMiddleware, requireRole(['chief_accountant', 'warehouse_manager']), async (req, res) => {
    try {
        const { id } = req.params;
        const { bank_reference, notes } = req.body;

        if (!bank_reference) {
            return res.status(400).json({
                success: false,
                message: 'Bank reference number is required'
            });
        }

        // Get reconciliation details
        const [reconciliations] = await pool.query(
            `SELECT p.order_id, p.amount, o.team_id
             FROM payment_reconciliations p
             JOIN sales_orders o ON p.order_id = o.id
             WHERE p.id = ? AND p.payment_method = 'bank_transfer'`,
            [id]
        );

        if (reconciliations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Bank transfer reconciliation not found'
            });
        }

        const { order_id, team_id } = reconciliations[0];

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Update reconciliation status
            await connection.query(
                `UPDATE payment_reconciliations 
                 SET reconciliation_status = 'confirmed', 
                     bank_reference = ?, bank_confirmed_by = ?, bank_confirmed_at = NOW(),
                     reconciled_at = NOW(), notes = ?
                 WHERE id = ?`,
                [bank_reference, req.user.id, notes || 'Transfer confirmed', id]
            );

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
                     VALUES ('sale_out', ?, ?, ?, 'sales_order', ?, ?, ?, 'Bank transfer confirmed')`,
                    [item.product_id, -item.quantity, item.cost_of_goods, order_id, team_id, req.user.id]
                );
            }

            // Update sales order
            await connection.query(
                `UPDATE sales_orders 
                 SET payment_status = 'reconciled'
                 WHERE id = ?`,
                [order_id]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Bank transfer confirmed. Stock deducted.'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Bank transfer reconciliation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to confirm bank transfer',
            error: error.message
        });
    }
});

module.exports = router;