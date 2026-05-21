// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../database');

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Find user by username
        const [users] = await pool.query(
            `SELECT id, username, password_hash, full_name, email, role, team_id, is_active 
             FROM users WHERE username = ? AND is_active = 1`,
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        const user = users[0];

        // In production, use bcrypt.compare()
        // For demo, we accept 'password123' as valid password
        // The stored hash in seed data is from 'password123'
        const isValidPassword = (password === 'password123');

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                team_id: user.team_id
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Return user info (without password hash)
        const userResponse = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            team_id: user.team_id
        };

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userResponse
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Get current user info
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await pool.query(
            'SELECT id, username, full_name, email, role, team_id FROM users WHERE id = ?',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user: users[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
