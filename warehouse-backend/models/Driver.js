// ============================================================
// Driver Model - Corrected Path
// ============================================================

const db = require('../database');  // ✅ Fixed path

class Driver {
    // Create a new driver
    static async create(driverData) {
        const { full_name, phone, email, vehicle_number, vehicle_type, driver_license, address, created_by } = driverData;
        
        const [result] = await db.query(
            `INSERT INTO drivers (full_name, phone, email, vehicle_number, vehicle_type, driver_license, address, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [full_name, phone, email, vehicle_number, vehicle_type, driver_license, address, created_by]
        );
        return result.insertId;
    }

    // Get all drivers
    static async getAll(filters = {}) {
        let query = 'SELECT * FROM drivers WHERE 1=1';
        const params = [];
        
        if (filters.status) {
            query += ' AND status = ?';
            params.push(filters.status);
        }
        
        if (filters.search) {
            query += ' AND (full_name LIKE ? OR phone LIKE ? OR vehicle_number LIKE ?)';
            const search = `%${filters.search}%`;
            params.push(search, search, search);
        }
        
        query += ' ORDER BY full_name ASC';
        
        const [rows] = await db.query(query, params);
        return rows;
    }

    // Get driver by ID
    static async getById(id) {
        const [rows] = await db.query('SELECT * FROM drivers WHERE id = ?', [id]);
        return rows[0];
    }

    // Update driver
    static async update(id, driverData) {
        const fields = [];
        const values = [];
        
        const allowedFields = ['full_name', 'phone', 'email', 'vehicle_number', 'vehicle_type', 'driver_license', 'address', 'status'];
        
        for (const field of allowedFields) {
            if (driverData[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(driverData[field]);
            }
        }
        
        if (fields.length === 0) return false;
        
        values.push(id);
        const [result] = await db.query(
            `UPDATE drivers SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        return result.affectedRows > 0;
    }

    // Delete driver (soft delete - set status to inactive)
    static async delete(id) {
        const [result] = await db.query('UPDATE drivers SET status = "inactive" WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    // Get driver assignments
    static async getAssignments(driverId, limit = 50) {
        const [rows] = await db.query(
            `SELECT * FROM driver_assignments 
             WHERE driver_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [driverId, limit]
        );
        return rows;
    }

    // Get driver settlement history
    static async getSettlementHistory(driverId, limit = 50) {
        const [rows] = await db.query(
            `SELECT ds.*, da.manifest_number, da.assignment_date
             FROM driver_settlements ds
             JOIN driver_assignments da ON ds.assignment_id = da.id
             WHERE da.driver_id = ?
             ORDER BY ds.settlement_date DESC
             LIMIT ?`,
            [driverId, limit]
        );
        return rows;
    }
}

module.exports = Driver;
