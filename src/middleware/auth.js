const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'shiptrack-buildsecure24-super-secret-key-998811';

// Authenticate JWT Token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Authentication token missing.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = await db.get('SELECT id, name, email, role, phone, vehicle_type, status FROM users WHERE id = ?', [decoded.id]);

    if (!user || user.status !== 'active') {
      return res.status(403).json({ error: 'User account inactive or not found.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired session token.' });
  }
}

// Require specific role(s)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Requires one of [${roles.join(', ')}] role privileges.` });
    }

    next();
  };
}

// Optional Auth (for public routes that can show extra info if logged in)
async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }
  next();
}

// Audit Logger Helper
async function recordAuditLog(userId, action, details, ipAddress = '127.0.0.1') {
  try {
    const db = await getDB();
    await db.run(
      `INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)`,
      [userId || null, action, details, ipAddress, new Date().toISOString()]
    );
  } catch (e) {
    console.error('[AUDIT ERROR]', e);
  }
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  requireRole,
  optionalAuth,
  recordAuditLog
};
