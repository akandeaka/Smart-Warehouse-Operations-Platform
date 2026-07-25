const db = require('../config/database');

class DriverAssignment {
    // Create a new driver assignment
    static async create(assignmentData) {
        const {
            driver_id,
            manifest_number,
            assignment_date,
            expected_return_date,
            items,
            created_by
        } = assignmentData;

        // Calculate totals
        let total_units = 0;
        let total_value = 0;
        items.forEach(item => {
            total_units += item.quantity;
            total_value += item.quantity * item.unit_price;
        });

        // Start transaction
        const connection = await db.getConnection();
        await connection.beginTransaction();

        try {
            // Insert assignment
            const [assignmentResult] = await connection.query(
                `INSERT INTO driver_assignments 
                 (driver_id, manifest_number, assignment_date, expected_return_date, 
                  total_units, total_value, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [driver_id, manifest_number, assignment_date, expected_return_date, 
                 total_units, total_value, created_by]
            );

            const assignmentId = assignmentResult.insertId;

            // Insert assignment items
            for (const item of items) {
                await connection.query(
                    `INSERT INTO driver_assignment_items 
                     (assignment_id, product_id, quantity, unit_price, total_price)
                     VALUES (?, ?, ?, ?, ?)`,
                    [assignmentId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]
                );

                // Update product stock (reduce available)
                await connection.query(
                    `UPDATE products SET current_stock = current_stock - ? WHERE id = ?`,
                    [item.quantity, item.product_id]
                );
            }

            await connection.commit();
            return assignmentId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get all assignments with filters
    static async getAll(filters = {}) {
        let query = `
            SELECT da.*, d.full_name as driver_name, d.phone as driver_phone,
                   d.vehicle_number, u.full_name as created_by_name
            FROM driver_assignments da
            JOIN drivers d ON da.driver_id = d.id
            LEFT JOIN users u ON da.created_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (filters.status) {
            query += ' AND da.status = ?';
            params.push(filters.status);
        }

        if (filters.driver_id) {
            query += ' AND da.driver_id = ?';
            params.push(filters.driver_id);
        }

        if (filters.date_from) {
            query += ' AND da.assignment_date >= ?';
            params.push(filters.date_from);
        }

        if (filters.date_to) {
            query += ' AND da.assignment_date <= ?';
            params.push(filters.date_to);
        }

        query += ' ORDER BY da.created_at DESC';

        const [rows] = await db.query(query, params);
        return rows;
    }

    // Get assignment by ID with items
    static async getById(id) {
        const [assignment] = await db.query(
            `SELECT da.*, d.full_name as driver_name, d.phone as driver_phone,
                    d.vehicle_number, u.full_name as created_by_name
             FROM driver_assignments da
             JOIN drivers d ON da.driver_id = d.id
             LEFT JOIN users u ON da.created_by = u.id
             WHERE da.id = ?`,
            [id]
        );

        if (!assignment[0]) return null;

        const [items] = await db.query(
            `SELECT dai.*, p.name as product_name, p.selling_price
             FROM driver_assignment_items dai
             JOIN products p ON dai.product_id = p.id
             WHERE dai.assignment_id = ?`,
            [id]
        );

        return {
            ...assignment[0],
            items: items
        };
    }

    // Update assignment status
    static async updateStatus(id, status, notes = null) {
        let query = 'UPDATE driver_assignments SET status = ?';
        const params = [status, id];

        if (status === 'returned') {
            query += ', actual_return_date = NOW()';
        }

        if (notes) {
            query += ', notes = ?';
            params.splice(1, 0, notes);
        }

        query += ' WHERE id = ?';
        const [result] = await db.query(query, params);
        return result.affectedRows > 0;
    }

    // Get pending settlements (returned but not settled)
    static async getPendingSettlements() {
        const [rows] = await db.query(
            `SELECT da.*, d.full_name as driver_name, d.phone as driver_phone,
                    d.vehicle_number
             FROM driver_assignments da
             JOIN drivers d ON da.driver_id = d.id
             WHERE da.status = 'returned'
             ORDER BY da.expected_return_date ASC`
        );
        return rows;
    }

    // Generate manifest number
    static generateManifestNumber() {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const timestamp = Date.now().toString().slice(-6);
        return `DRV-${dateStr}-${timestamp}`;
    }
}

module.exports = DriverAssignment;
