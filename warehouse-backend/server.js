// ============================================================
// CREDIT APPROVALS - CORRECTED VERSION
// ============================================================

// Get pending credit approvals (for manager view)
app.get('/api/approvals/pending', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const [approvals] = await pool.query(
            `SELECT c.id, o.order_number, o.customer_name, o.total_amount, o.payment_method, 
                    u.full_name as requested_by, c.requested_at, c.due_date
             FROM credit_approvals c
             JOIN sales_orders o ON c.order_id = o.id
             JOIN users u ON c.requested_by = u.id
             WHERE c.status = 'pending'`
        );
        res.json({ success: true, data: approvals });
    } catch (error) {
        console.error('Error fetching pending approvals:', error);
        res.json({ success: true, data: [] });
    }
});

// Approve credit with amount modification
app.post('/api/approvals/approve', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { approval_id, approved_amount } = req.body;
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // Get order_id from approval
            const [approval] = await connection.query('SELECT order_id FROM credit_approvals WHERE id = ?', [approval_id]);
            if (approval.length === 0) throw new Error('Approval not found');
            const order_id = approval[0].order_id;
            
            // Update order amount if changed by manager
            if (approved_amount && approved_amount > 0) {
                await connection.query('UPDATE sales_orders SET total_amount = ? WHERE id = ?', [approved_amount, order_id]);
            }
            
            // Update credit_approvals status to 'approved'
            await connection.query(
                'UPDATE credit_approvals SET status = "approved", approved_by = ?, approved_at = NOW() WHERE id = ?',
                [req.user.id, approval_id]
            );
            
            // Update sales_orders approval_status
            await connection.query(
                'UPDATE sales_orders SET approval_status = "approved", payment_status = "pending" WHERE id = ?',
                [order_id]
            );
            
            // Get order items to update stock allocations
            const [items] = await connection.query(
                `SELECT oi.product_id, oi.quantity, oi.cost_of_goods, o.team_id 
                 FROM sales_order_items oi 
                 JOIN sales_orders o ON oi.order_id = o.id 
                 WHERE o.id = ?`,
                [order_id]
            );
            
            for (const item of items) {
                // Update allocation sold_qty
                await connection.query(
                    'UPDATE sales_team_allocations SET sold_qty = sold_qty + ? WHERE team_id = ? AND product_id = ? AND allocated_date = CURDATE()',
                    [item.quantity, item.team_id, item.product_id]
                );
                
                // Record stock transaction
                await connection.query(
                    `INSERT INTO stock_transactions 
                     (transaction_type, product_id, quantity_change, unit_cost_at_time, 
                      reference_type, reference_id, team_id, created_by) 
                     VALUES ('sale_out', ?, ?, ?, 'sales_order', ?, ?, ?)`,
                    [item.product_id, -item.quantity, item.cost_of_goods, order_id, item.team_id, req.user.id]
                );
            }
            
            await connection.commit();
            res.json({ success: true, message: 'Credit approved successfully' });
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reject credit
app.post('/api/approvals/reject', authMiddleware, requireRole(['warehouse_manager']), async (req, res) => {
    try {
        const { approval_id } = req.body;
        
        // Get order_id from approval
        const [approval] = await pool.query('SELECT order_id FROM credit_approvals WHERE id = ?', [approval_id]);
        if (approval.length === 0) throw new Error('Approval not found');
        const order_id = approval[0].order_id;
        
        // Update credit_approvals status to 'rejected' (NOT a column called 'rejected')
        await pool.query(
            'UPDATE credit_approvals SET status = "rejected", approved_by = ?, approved_at = NOW() WHERE id = ?',
            [req.user.id, approval_id]
        );
        
        // Update sales_orders approval_status
        await pool.query(
            'UPDATE sales_orders SET approval_status = "rejected" WHERE id = ?',
            [order_id]
        );
        
        res.json({ success: true, message: 'Credit rejected successfully' });
        
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
