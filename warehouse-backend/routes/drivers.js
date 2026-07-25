const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const DriverAssignment = require('../models/DriverAssignment');
const DriverSettlement = require('../models/DriverSettlement');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// ============================================
// DRIVER MANAGEMENT ROUTES
// ============================================

// Get all drivers
router.get('/', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const drivers = await Driver.getAll(req.query);
        res.json({ success: true, data: drivers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get driver by ID
router.get('/:id', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const driver = await Driver.getById(req.params.id);
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, data: driver });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new driver
router.post('/', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const driverData = {
            ...req.body,
            created_by: req.user.id
        };
        const driverId = await Driver.create(driverData);
        res.status(201).json({ 
            success: true, 
            message: 'Driver created successfully',
            data: { id: driverId }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update driver
router.put('/:id', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const updated = await Driver.update(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, message: 'Driver updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete driver
router.delete('/:id', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const deleted = await Driver.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        res.json({ success: true, message: 'Driver deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get driver assignments
router.get('/:id/assignments', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const assignments = await Driver.getAssignments(req.params.id);
        res.json({ success: true, data: assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DRIVER ASSIGNMENT ROUTES
// ============================================

// Get all assignments
router.get('/assignments', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const assignments = await DriverAssignment.getAll(req.query);
        res.json({ success: true, data: assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get pending settlements
router.get('/assignments/pending', authMiddleware, roleMiddleware(['admin', 'warehouse_manager', 'reconciliation']), async (req, res) => {
    try {
        const pending = await DriverAssignment.getPendingSettlements();
        res.json({ success: true, data: pending });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get assignment by ID
router.get('/assignments/:id', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const assignment = await DriverAssignment.getById(req.params.id);
        if (!assignment) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        res.json({ success: true, data: assignment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new assignment
router.post('/assignments', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const assignmentData = {
            ...req.body,
            manifest_number: DriverAssignment.generateManifestNumber(),
            assignment_date: new Date().toISOString().slice(0, 10),
            created_by: req.user.id
        };
        
        const assignmentId = await DriverAssignment.create(assignmentData);
        res.status(201).json({ 
            success: true, 
            message: 'Assignment created successfully',
            data: { id: assignmentId, manifest_number: assignmentData.manifest_number }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update assignment status (returned)
router.put('/assignments/:id/return', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const updated = await DriverAssignment.updateStatus(req.params.id, 'returned', req.body.notes);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }
        res.json({ success: true, message: 'Driver return recorded successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// DRIVER SETTLEMENT ROUTES
// ============================================

// Get all settlements
router.get('/settlements', authMiddleware, roleMiddleware(['admin', 'warehouse_manager', 'reconciliation']), async (req, res) => {
    try {
        const settlements = await DriverSettlement.getAll(req.query);
        res.json({ success: true, data: settlements });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get settlement by ID
router.get('/settlements/:id', authMiddleware, roleMiddleware(['admin', 'warehouse_manager', 'reconciliation']), async (req, res) => {
    try {
        const settlement = await DriverSettlement.getById(req.params.id);
        if (!settlement) {
            return res.status(404).json({ success: false, message: 'Settlement not found' });
        }
        res.json({ success: true, data: settlement });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new settlement
router.post('/settlements', authMiddleware, roleMiddleware(['admin', 'warehouse_manager', 'reconciliation']), async (req, res) => {
    try {
        const settlementData = {
            ...req.body,
            settled_by: req.user.id
        };
        
        const settlementId = await DriverSettlement.create(settlementData);
        res.status(201).json({ 
            success: true, 
            message: 'Settlement completed successfully',
            data: { id: settlementId }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update settlement status
router.put('/settlements/:id/status', authMiddleware, roleMiddleware(['admin', 'warehouse_manager']), async (req, res) => {
    try {
        const { status, resolution_notes } = req.body;
        const updated = await DriverSettlement.updateStatus(req.params.id, status, resolution_notes);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Settlement not found' });
        }
        res.json({ success: true, message: 'Settlement status updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get daily settlement summary
router.get('/settlements/summary/daily', authMiddleware, roleMiddleware(['admin', 'warehouse_manager', 'reconciliation']), async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const summary = await DriverSettlement.getDailySummary(date);
        res.json({ success: true, data: summary });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
