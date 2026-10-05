const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');
const { JWT_SECRET, authenticateToken, recordAuditLog } = require('../middleware/auth');

// Register Endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'customer', phone, vehicle_type } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required fields.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Role validation: public registration allows 'customer' or 'driver' (admin requires existing admin)
    const allowedRole = (role === 'driver') ? 'driver' : 'customer';

    const db = await getDB();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'User with this email address already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const result = await db.run(
      `INSERT INTO users (name, email, password, role, phone, vehicle_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.toLowerCase().trim(), hashedPassword, allowedRole, phone || '', vehicle_type || '', 'active', now]
    );

    const userId = result.lastID;
    const token = jwt.sign({ id: userId, email: email.toLowerCase().trim(), role: allowedRole }, JWT_SECRET, { expiresIn: '7d' });

    await recordAuditLog(userId, 'USER_REGISTERED', `New ${allowedRole} registered: ${email}`);

    res.status(201).json({
      message: 'Registration successful!',
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: allowedRole,
        phone: phone || '',
        vehicle_type: vehicle_type || ''
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to process user registration.' });
  }
});

// Login Endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = await getDB();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);

    if (!user) {
      await recordAuditLog(null, 'LOGIN_FAILED', `Failed login attempt for non-existent user: ${email}`);
      return res.status(401).json({ error: 'Invalid email address or password.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await recordAuditLog(user.id, 'LOGIN_FAILED', `Invalid password for user: ${email}`);
      return res.status(401).json({ error: 'Invalid email address or password.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    await recordAuditLog(user.id, 'USER_LOGIN_SUCCESS', `User logged in successfully as ${user.role}`);

    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        vehicle_type: user.vehicle_type
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to process login request.' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
