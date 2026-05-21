// routes/daily.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Close the day (5 PM)
router.post('/close', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // Check if day is already closed
        const [existing] = await pool.query(
            'SELECT id FROM daily_closures WHERE closure_date = ?',
            [today]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Day is already closed'
            });
        }

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Get warehouse value before return
            const [beforeValue] = await connection.query(
                'SELECT SUM(current_qty * unit_cost) as value FROM products'
            );
            const beforeValueAmount = beforeValue[0].value || 0;

            // Get unsold stock from all teams
            const [unsold] = await connection.query(
                `SELECT team_id, product_id, (allocated_qty - sold_qty - returned_qty) as to_return
                 FROM sales_team_allocations
                 WHERE allocated_date = ? AND (allocated_qty - sold_qty - returned_qty) > 0
                   AND status = 'active'`,
                [today]
            );

            // Return unsold stock
            for (const item of unsold) {
                // Update allocation
                await connection.query(
                    `UPDATE sales_team_allocations 
                     SET returned_qty = returned_qty + ?, status = 'closed'
                     WHERE team_id = ? AND product_id = ? AND allocated_date = ?`,
                    [item.to_return, item.team_id, item.product_id, today]
                );

                // Get product cost
                const [product] = await connection.query(
                    'SELECT unit_cost FROM products WHERE id = ?',
                    [item.product_id]
                );
                const unit_cost = product[0]?.unit_cost || 0;

                // Record stock transaction (trigger will update products.current_qty)
                await connection.query(
                    `INSERT INTO stock_transactions 
                     (transaction_type, product_id, quantity_change, unit_cost_at_time, 
                      reference_type, team_id, created_by, notes)
                     VALUES ('return_from_team', ?, ?, ?, 'daily_closure', ?, ?, '5 PM return - unsold stock')`,
                    [item.product_id, item.to_return, unit_cost, item.team_id, req.user.id]
                );
            }

            // Get warehouse value after return
            const [afterValue] = await connection.query(
                'SELECT SUM(current_qty * unit_cost) as value FROM products'
            );
            const afterValueAmount = afterValue[0].value || 0;

            // Get today's sales totals
            const [salesTotal] = await connection.query(
                `SELECT SUM(total_amount) as total,
                        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash,
                        SUM(CASE WHEN payment_method = 'bank_transfer' THEN total_amount ELSE 0 END) as transfer,
                        SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as credit
                 FROM sales_orders
                 WHERE sales_date = ?`,
                [today]
            );

            // Get unreconciled count
            const [unreconciled] = await connection.query(
                `SELECT COUNT(*) as count
                 FROM sales_orders o
                 LEFT JOIN payment_reconciliations p ON o.id = p.order_id
                 WHERE o.sales_date = ? 
                   AND o.payment_method IN ('cash', 'bank_transfer')
                   AND (p.id IS NULL OR p.reconciliation_status != 'confirmed')`,
                [today]
            );

            // Create daily closure record
            await connection.query(
                `INSERT INTO daily_closures 
                 (closure_date, closed_by, warehouse_value_before_close, warehouse_value_after_close,
                  total_sales_value, total_cash_collected, total_transfer_collected, 
                  total_credit_issued, unreconciled_count, is_locked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [
                    today, req.user.id, beforeValueAmount, afterValueAmount,
                    salesTotal[0]?.total || 0,
                    salesTotal[0]?.cash || 0,
                    salesTotal[0]?.transfer || 0,
                    salesTotal[0]?.credit || 0,
                    unreconciled[0]?.count || 0
                ]
            );

            // Close any active allocations without unsold stock
            await connection.query(
                `UPDATE sales_team_allocations 
                 SET status = 'closed'
                 WHERE allocated_date = ? AND status = 'active'`,
                [today]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Day closed successfully',
                summary: {
                    warehouse_value_before: beforeValueAmount,
                    warehouse_value_after: afterValueAmount,
                    total_sales: salesTotal[0]?.total || 0,
                    unsold_returned_count: unsold.length,
                    unreconciled_count: unreconciled[0]?.count || 0
                }
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Daily closure error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to close day',
            error: error.message
        });
    }
});

// Get closure status for today
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [closure] = await pool.query(
            'SELECT * FROM daily_closures WHERE closure_date = ?',
            [today]
        );

        const isClosed = closure.length > 0;

        res.json({
            success: true,
            date: today,
            is_closed: isClosed,
            closure_data: closure[0] || null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to get closure status',
            error: error.message
        });
    }
});

module.exports = router;