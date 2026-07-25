const db = require('../config/database');

class DriverSettlement {
    // Create a new settlement
    static async create(settlementData) {
        const {
            assignment_id,
            cash_returned,
            cash_breakdown,
            returns_items,
            settled_by,
            notes
        } = settlementData;

        // Get assignment details
        const [assignmentRows] = await db.query(
            'SELECT * FROM driver_assignments WHERE id = ?',
            [assignment_id]
        );
        
        if (!assignmentRows[0]) {
            throw new Error('Assignment not found');
        }
        
        const assignment = assignmentRows[0];

        // Calculate returns value
        let returns_value = 0;
        for (const item of returns_items) {
            returns_value += item.quantity_returned * item.unit_price;
        }

        const total_expected = assignment.total_value;
        const difference = (cash_returned + returns_value) - total_expected;
        
        let difference_type = 'exact';
        if (difference > 0) difference_type = 'excess';
        else if (difference < 0) difference_type = 'shortage';

        const status = difference === 0 ? 'settled' : 'flagged';

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Insert settlement
            const [settlementResult] = await connection.query(
                `INSERT INTO driver_settlements 
                 (assignment_id, cash_returned, cash_breakdown, returns_value, 
                  total_expected, difference, difference_type, status, settled_by, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [assignment_id, cash_returned, cash_breakdown, returns_value, 
                 total_expected, difference, difference_type, status, settled_by, notes]
            );

            const settlementId = settlementResult.insertId;

            // Insert settlement items
            for (const item of returns_items) {
                // Get assigned quantity
                const [assignedRows] = await connection.query(
                    'SELECT quantity FROM driver_assignment_items WHERE assignment_id = ? AND product_id = ?',
                    [assignment_id, item.product_id]
                );
                
                const quantity_assigned = assignedRows[0]?.quantity || 0;

                await connection.query(
                    `INSERT INTO driver_settlement_items 
                     (settlement_id, product_id, quantity_assigned, quantity_returned, 
                      unit_price, returned_value, condition, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [settlementId, item.product_id, quantity_assigned, item.quantity_returned,
                     item.unit_price, item.quantity_returned * item.unit_price, 
                     item.condition || 'good', item.notes || '']
                );

                // Update product stock (add returned goods back)
                await connection.query(
                    'UPDATE products SET current_stock = current_stock + ? WHERE id = ?',
                    [item.quantity_returned, item.product_id]
                );
            }

            // Update assignment status
            await connection.query(
                'UPDATE driver_assignments SET status = ? WHERE id = ?',
                [status, assignment_id]
            );

            await connection.commit();
            return settlementId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get all settlements
    static async getAll(filters = {}) {
        let query = `
            SELECT ds.*, da.manifest_number, da.assignment_date,
                   d.full_name as driver_name, d.phone as driver_phone,
                   u.full_name as settled_by_name
            FROM driver_settlements ds
            JOIN driver_assignments da ON ds.assignment_id = da.id
            JOIN drivers d ON da.driver_id = d.id
            LEFT JOIN users u ON ds.settled_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            query += ' AND ds.status = ?';
            params.push(filters.status);
        }

        if (filters.driver_id) {
            query += ' AND da.driver_id = ?';
            params.push(filters.driver_id);
        }

        if (filters.date_from) {
            query += ' AND ds.settlement_date >= ?';
            params.push(filters.date_from);
        }

        if (filters.date_to) {
            query += ' AND ds.settlement_date <= ?';
            params.push(filters.date_to);
        }

        query += ' ORDER BY ds.settlement_date DESC';

        const [rows] = await db.query(query, params);
        return rows;
    }

    // Get settlement by ID with items
    static async getById(id) {
        const [settlement] = await db.query(
            `SELECT ds.*, da.manifest_number, da.assignment_date,
                    d.full_name as driver_name, d.phone as driver_phone,
                    u.full_name as settled_by_name
             FROM driver_settlements ds
             JOIN driver_assignments da ON ds.assignment_id = da.id
             JOIN drivers d ON da.driver_id = d.id
             LEFT JOIN users u ON ds.settled_by = u.id
             WHERE ds.id = ?`,
            [id]
        );

        if (!settlement[0]) return null;

        const [items] = await db.query(
            `SELECT dsi.*, p.name as product_name
             FROM driver_settlement_items dsi
             JOIN products p ON dsi.product_id = p.id
             WHERE dsi.settlement_id = ?`,
            [id]
        );

        return {
            ...settlement[0],
            items: items
        };
    }

    // Update settlement status
    static async updateStatus(id, status, resolution_notes = null) {
        let query = 'UPDATE driver_settlements SET status = ?';
        const params = [status, id];

        if (resolution_notes) {
            query += ', resolution_notes = ?';
            params.splice(1, 0, resolution_notes);
        }

        query += ' WHERE id = ?';
        const [result] = await db.query(query, params);
        return result.affectedRows > 0;
    }

    // Get daily settlement summary
    static async getDailySummary(date) {
        const [rows] = await db.query(
            `SELECT 
                COUNT(*) as total_settlements,
                SUM(cash_returned) as total_cash,
                SUM(returns_value) as total_returns,
                SUM(total_expected) as total_expected,
                SUM(difference) as total_difference,
                COUNT(CASE WHEN difference != 0 THEN 1 END) as discrepancies,
                COUNT(CASE WHEN status = 'flagged' THEN 1 END) as flagged_settlements
             FROM driver_settlements
             WHERE DATE(settlement_date) = ?`,
            [date]
        );
        return rows[0];
    }
}

module.exports = DriverSettlement;
