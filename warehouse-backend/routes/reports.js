// routes/reports.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Daily sales report
router.get('/daily', authMiddleware, async (req, res) => {
    try {
        const { date } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const [report] = await pool.query(
            `SELECT t.team_name,
                    COUNT(DISTINCT o.id) as num_orders,
                    SUM(o.total_amount) as total_sales,
                    SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_amount ELSE 0 END) as cash_sales,
                    SUM(CASE WHEN o.payment_method = 'bank_transfer' THEN o.total_amount ELSE 0 END) as transfer_sales,
                    SUM(CASE WHEN o.payment_method = 'credit' THEN o.total_amount ELSE 0 END) as credit_sales
             FROM sales_teams t
             LEFT JOIN sales_orders o ON t.id = o.team_id AND o.sales_date = ?
             GROUP BY t.id, t.team_name`,
            [reportDate]
        );

        // Get grand total
        const [grandTotal] = await pool.query(
            `SELECT SUM(total_amount) as grand_total,
                    SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as total_cash,
                    SUM(CASE WHEN payment_method = 'bank_transfer' THEN total_amount ELSE 0 END) as total_transfer,
                    SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as total_credit
             FROM sales_orders
             WHERE sales_date = ?`,
            [reportDate]
        );

        res.json({
            success: true,
            date: reportDate,
            teams: report,
            totals: grandTotal[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate daily report',
            error: error.message
        });
    }
});

// Monthly sales summary
router.get('/monthly', authMiddleware, requireRole(['warehouse_manager', 'chief_accountant']), async (req, res) => {
    try {
        const { year, month } = req.query;
        const reportYear = year || new Date().getFullYear();
        const reportMonth = month || new Date().getMonth() + 1;

        const [summary] = await pool.query(
            `SELECT t.team_name,
                    COUNT(o.id) as num_orders,
                    SUM(o.total_amount) as total_sales,
                    DATE_FORMAT(o.sales_date, '%Y-%m-%d') as sale_date
             FROM sales_teams t
             LEFT JOIN sales_orders o ON t.id = o.team_id 
                AND YEAR(o.sales_date) = ? AND MONTH(o.sales_date) = ?
             GROUP BY t.id, t.team_name, DATE(o.sales_date)
             ORDER BY sale_date ASC`,
            [reportYear, reportMonth]
        );

        res.json({
            success: true,
            year: reportYear,
            month: reportMonth,
            data: summary
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate monthly report',
            error: error.message
        });
    }
});

// Stock valuation report
router.get('/stock-valuation', authMiddleware, async (req, res) => {
    try {
        const [products] = await pool.query(
            `SELECT sku, product_name, current_qty, unit_cost, total_value, min_stock_level,
                    CASE 
                        WHEN current_qty <= min_stock_level THEN 'LOW STOCK'
                        WHEN current_qty = 0 THEN 'OUT OF STOCK'
                        ELSE 'OK'
                    END as stock_status
             FROM products
             WHERE is_active = 1
             ORDER BY total_value DESC`
        );

        const [summary] = await pool.query(
            `SELECT SUM(current_qty) as total_units, SUM(total_value) as total_value
             FROM products
             WHERE is_active = 1`
        );

        res.json({
            success: true,
            products,
            summary: summary[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to generate stock valuation',
            error: error.message
        });
    }
});

module.exports = router;
