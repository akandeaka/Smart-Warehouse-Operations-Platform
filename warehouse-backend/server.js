// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./database');

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const approvalRoutes = require('./routes/approvals');
const reconciliationRoutes = require('./routes/reconciliations');
const reportRoutes = require('./routes/reports');
const dailyRoutes = require('./routes/daily');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// SECURITY MIDDLEWARE
// ============================================================

// Helmet for security headers
app.use(helmet());

// CORS for frontend access
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://warehouse-stock-balancing-system.onrender.com',
        'http://localhost:3000'
    ],
    credentials: true
}));

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// REQUEST LOGGING (for debugging)
// ============================================================
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
// HEALTH CHECK ENDPOINT
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/reconciliations', reconciliationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/daily', dailyRoutes);

// ============================================================
// 404 HANDLER
// ============================================================
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
    // Test database connection
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
        console.error('❌ Cannot start server: Database connection failed');
        console.error('Please check your database credentials in .env file');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`\n========================================`);
        console.log(`🚀 Warehouse Stock System API Server`);
        console.log(`========================================`);
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`📊 Health Check: http://localhost:${PORT}/health`);
        console.log(`🔐 API Base: http://localhost:${PORT}/api`);
        console.log(`========================================\n`);
    });
}

startServer();
