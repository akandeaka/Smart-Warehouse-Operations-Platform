// ============================================================
// server.js - Complete Backend with RBAC, 2FA, PWA, and DRIVERS
// ============================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');  // ← ADD THIS AT THE TOP!

const { pool, testConnection } = require('./database');

// ============================================================
// CREATE APP - ONLY ONCE
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// ============================================================
// PWA HEADERS MIDDLEWARE
// ============================================================
app.use((req, res, next) => {
    // Set cache control for service worker
    if (req.path === '/sw.js' || req.path === '/manifest.json') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    
    // Set secure headers for PWA
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // For iOS PWA
    if (req.path === '/') {
        res.setHeader('apple-mobile-web-app-capable', 'yes');
        res.setHeader('apple-mobile-web-app-status-bar-style', 'black-translucent');
        res.setHeader('apple-mobile-web-app-title', 'Smart Warehouse');
    }
    
    next();
});

// ============================================================
// PWA INSTALL STATS ENDPOINT
// ============================================================
app.post('/api/analytics/install', (req, res) => {
    console.log('PWA Install analytics:', req.body);
    res.json({ success: true });
});

// ============================================================
// SERVE STATIC FILES
// ============================================================
const possiblePaths = [
    path.join(__dirname, 'frontend'),
    path.join(__dirname, '../frontend'),
    path.join(process.cwd(), 'frontend'),
    path.join(process.cwd(), 'warehouse-backend', 'frontend'),
    '/opt/render/project/src/frontend',
    '/opt/render/project/src/warehouse-backend/frontend'
];

let frontendPath = null;
for (const testPath of possiblePaths) {
    try {
        if (fs.existsSync(testPath)) {
            frontendPath = testPath;
            console.log(`✅ Found frontend at: ${frontendPath}`);
            break;
        }
    } catch (err) {
        // Ignore errors
    }
}

if (!frontendPath) {
    const searchPaths = ['/opt/render/project/src', process.cwd(), __dirname];
    for (const basePath of searchPaths) {
        try {
            const files = fs.readdirSync(basePath);
            if (files.includes('frontend')) {
                frontendPath = path.join(basePath, 'frontend');
                break;
            }
            if (files.includes('login.html')) {
                frontendPath = basePath;
                break;
            }
        } catch (err) {
            // Ignore errors
        }
    }
}

if (frontendPath) {
    app.use(express.static(frontendPath));
    console.log(`✅ Static files served from: ${frontendPath}`);
} else {
    console.error('❌ Frontend directory not found');
}

// ============================================================
// SERVE MANIFEST.JSON FROM ROOT
// ============================================================
app.get('/manifest.json', (req, res) => {
    const manifestPath = path.join(__dirname, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
        res.sendFile(manifestPath);
        console.log('✅ Serving manifest.json');
    } else {
        console.log('❌ manifest.json not found at:', manifestPath);
        res.status(404).json({ error: 'manifest.json not found' });
    }
});

// Root route
app.get('/', (req, res) => {
    if (frontendPath) {
        const loginPath = path.join(frontendPath, 'login.html');
        if (fs.existsSync(loginPath)) {
            res.sendFile(loginPath);
        } else {
            res.status(404).send('login.html not found');
        }
    } else {
        res.status(500).send('Frontend directory not configured');
    }
});

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const decoded = Buffer.from(token, 'base64').toString().split(':');
        const username = decoded[0];
        
        const [users] = await pool.query(
            'SELECT id, role, team_id FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        req.user = {
            id: users[0].id,
            username: username,
            role: users[0].role,
            team_id: users[0].team_id
        };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    };
};

// ============================================================
// SUPER ADMIN MIDDLEWARE
// ============================================================
const superAdminMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const decoded = Buffer.from(token, 'base64').toString().split(':');
        
        const [users] = await pool.query(
            'SELECT role FROM users WHERE username = ? AND is_active = 1',
            [decoded[0]]
        );
        
        if (users.length === 0 || users[0].role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
        }
        
        req.user = { username: decoded[0], role: users[0].role };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================================
// 2FA AND PORTAL-SPECIFIC LOGIN - FIXED!
// ============================================================
const twofaPending = new Map();

app.post('/api/auth/login-portal', async (req, res) => {
    try {
        const { username, password, portal } = req.body;
        
        // --- FIX: Include password_hash in SELECT ---
        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id, is_active, twofa_secret, password_hash FROM users WHERE username = ? AND is_active = 1',
            [username]
        );
        
        // --- FIX: Check if user exists ---
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // --- FIX: Verify password using bcrypt ---
        const isValidPassword = bcrypt.compareSync(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // --- REST OF THE CODE STAYS THE SAME ---
        let roleMatch = false;
        let redirectUrl = '';
        
        switch(portal) {
            case 'super-admin':
                roleMatch = (user.role === 'super_admin');
                redirectUrl = '/super-admin.html';
                break;
            case 'manager':
                roleMatch = (user.role === 'warehouse_manager');
                redirectUrl = '/manager-dashboard.html';
                break;
            case 'sales':
                roleMatch = (user.role === 'sales_rep');
                redirectUrl = '/sales-dashboard.html';
                break;
            case 'reconciliation':
                roleMatch = (user.role === 'reconciliation');
                redirectUrl = '/reconciliation-dashboard.html';
                break;
            default:
                return res.status(400).json({ success: false, message: 'Invalid portal' });
        }
        
        if (!roleMatch) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Your role: ${user.role}`
            });
        }
        
        if (user.role === 'super_admin' && user.twofa_secret) {
            const sessionId = Math.random().toString(36).substring(2, 15);
            twofaPending.set(sessionId, {
                userId: user.id,
                username: user.username,
                role: user.role,
                redirectUrl: redirectUrl,
                expiresAt: Date.now() + (5 * 60 * 1000)
            });
            
            return res.json({
                success: true,
                requiresTwoFA: true,
                sessionId: sessionId,
                message: '2FA required. Enter your secret code.'
            });
        }
        
        const token = Buffer.from(`${user.username}:${Date.now()}`).toString('base64');
        
        res.json({
            success: true,
            token: token,
            redirectUrl: redirectUrl,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                team_id: user.team_id
            }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ... rest of your server.js stays the same ...

// ============================================================
// START SERVER - ONLY ONCE
// ============================================================
async function startServer() {
    console.log('🔄 Testing database connection...');
    const dbConnected = await testConnection();
    
    if (dbConnected) {
        console.log('✅ Database connected. Starting server...');
    } else {
        console.log('⚠️ Database connection failed. Starting server with limited functionality...');
    }
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`📱 App URL: http://localhost:${PORT}`);
        console.log(`💚 Health check: http://localhost:${PORT}/health`);
        console.log(`📊 Manager Dashboard: http://localhost:${PORT}/manager-dashboard.html`);
        console.log(`👨‍✈️ Driver Management: http://localhost:${PORT}/driver-management.html`);
        console.log(`💰 Reconciliation: http://localhost:${PORT}/reconciliation-dashboard.html`);
        console.log(`🛒 Sales Dashboard: http://localhost:${PORT}/sales-dashboard.html`);
    });
}

startServer();

// ============================================================
// EXPORT APP (For testing)
// ============================================================
module.exports = app;
