// routes/products.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

// Get all products (any authenticated user)
router.get('/', authMiddleware, async (req, res) => {
    try {
        const [products] = await pool.query(
            `SELECT id, sku, product_name, description, unit_cost, selling_price, 
                    current_qty, total_value, min_stock_level, is_active
             FROM products WHERE is_active = 1`
        );

        res.json({
            success: true,
            data: products,
            count: products.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products',
            error: error.message
        });
    }
});

// Get single product by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const [products] = await pool.query(
            'SELECT * FROM products WHERE id = ? AND is_active = 1',
            [id]
        );

        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({ success: true, data: products[0] });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product',
            error: error.message
        });
    }
});

// Add new product (manager only)
router.post('/', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { sku, product_name, description, unit_cost, selling_price, min_stock_level } = req.body;

        // Validate required fields
        if (!sku || !product_name || !unit_cost || !selling_price) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: sku, product_name, unit_cost, selling_price'
            });
        }

        // Check if SKU already exists
        const [existing] = await pool.query('SELECT id FROM products WHERE sku = ?', [sku]);
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Product with SKU '${sku}' already exists`
            });
        }

        const [result] = await pool.query(
            `INSERT INTO products (sku, product_name, description, unit_cost, selling_price, min_stock_level, current_qty)
             VALUES (?, ?, ?, ?, ?, ?, 0)`,
            [sku, product_name, description, unit_cost, selling_price, min_stock_level || 0]
        );

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product_id: result.insertId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to create product',
            error: error.message
        });
    }
});

// Update product stock (manager only)
router.put('/:id/stock', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity_change, reason } = req.body;

        if (!quantity_change || quantity_change === 0) {
            return res.status(400).json({
                success: false,
                message: 'quantity_change is required and cannot be zero'
            });
        }

        // Get product current cost
        const [products] = await pool.query('SELECT unit_cost FROM products WHERE id = ?', [id]);
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const unit_cost = products[0].unit_cost;

        // Start transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert stock transaction
            await connection.query(
                `INSERT INTO stock_transactions 
                 (transaction_type, product_id, quantity_change, unit_cost_at_time, created_by, notes)
                 VALUES ('adjustment', ?, ?, ?, ?, ?)`,
                [id, quantity_change, unit_cost, req.user.id, reason || 'Manual adjustment']
            );

            // Product quantity will be auto-updated by trigger
            await connection.commit();

            res.json({
                success: true,
                message: `Stock ${quantity_change > 0 ? 'increased' : 'decreased'} successfully`
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update stock',
            error: error.message
        });
    }
});

module.exports = router;