const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../db/database');
const { authenticateToken, requireRole, recordAuditLog } = require('../middleware/auth');

// Require Admin Role for all endpoints in this router
router.use(authenticateToken, requireRole('admin'));

// 1. Dashboard Statistics
router.get('/stats', async (req, res) => {
  try {
    const db = await getDB();

    const totalShipments = await db.get('SELECT COUNT(*) as count FROM shipments');
    const inTransit = await db.get("SELECT COUNT(*) as count FROM shipments WHERE status IN ('PICKED_UP', 'IN_TRANSIT')");
    const outForDelivery = await db.get("SELECT COUNT(*) as count FROM shipments WHERE status = 'OUT_FOR_DELIVERY'");
    const delivered = await db.get("SELECT COUNT(*) as count FROM shipments WHERE status = 'DELIVERED'");
    const unassigned = await db.get('SELECT COUNT(*) as count FROM shipments WHERE driver_id IS NULL');
    
    const totalCustomers = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'customer'");
    const totalDrivers = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'driver'");
    const totalRevenue = await db.get('SELECT SUM(shipping_cost) as total FROM shipments');

    res.json({
      stats: {
        total_shipments: totalShipments.count || 0,
        in_transit: inTransit.count || 0,
        out_for_delivery: outForDelivery.count || 0,
        delivered: delivered.count || 0,
        unassigned: unassigned.count || 0,
        total_customers: totalCustomers.count || 0,
        total_drivers: totalDrivers.count || 0,
        total_revenue: parseFloat((totalRevenue.total || 0).toFixed(2))
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin statistics.' });
  }
});

// 2. Get All Shipments (Admin Overview)
router.get('/shipments', async (req, res) => {
  try {
    const db = await getDB();
    const { status, driver_id, search } = req.query;

    let query = `
      SELECT s.*, 
             c.name as customer_name, c.email as customer_email,
             d.name as driver_name, d.phone as driver_phone, d.vehicle_type as driver_vehicle
      FROM shipments s
      LEFT JOIN users c ON s.customer_id = c.id
      LEFT JOIN users d ON s.driver_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    if (driver_id === 'unassigned') {
      query += ` AND s.driver_id IS NULL`;
    } else if (driver_id) {
      query += ` AND s.driver_id = ?`;
      params.push(driver_id);
    }

    if (search) {
      query += ` AND (s.tracking_number LIKE ? OR s.recipient_name LIKE ? OR s.sender_name LIKE ? OR s.recipient_city LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY s.created_at DESC`;

    const shipments = await db.all(query, params);
    res.json({ shipments });
  } catch (err) {
    console.error('Admin shipment list error:', err);
    res.status(500).json({ error: 'Failed to fetch overall shipment list.' });
  }
});

// 3. Assign Driver to Shipment
router.put('/shipments/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { driver_id } = req.body;

    if (!driver_id) {
      return res.status(400).json({ error: 'Driver ID is required for shipment assignment.' });
    }

    const db = await getDB();
    const shipment = await db.get('SELECT * FROM shipments WHERE id = ?', [id]);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment record not found.' });
    }

    const driver = await db.get("SELECT * FROM users WHERE id = ? AND role = 'driver'", [driver_id]);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found or invalid role.' });
    }

    const now = new Date().toISOString();

    await db.run(
      'UPDATE shipments SET driver_id = ?, updated_at = ? WHERE id = ?',
      [driver_id, now, id]
    );

    // Timeline entry for driver assignment
    await db.run(`
      INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      id,
      req.user.id,
      shipment.status,
      shipment.current_location,
      `Assigned to delivery driver ${driver.name} (${driver.vehicle_type || 'Driver'})`,
      now
    ]);

    await recordAuditLog(
      req.user.id,
      'SHIPMENT_ASSIGNED',
      `Assigned shipment ${shipment.tracking_number} to driver ${driver.name} (ID: ${driver_id})`
    );

    res.json({
      message: `Shipment ${shipment.tracking_number} successfully assigned to ${driver.name}.`,
      driver: {
        id: driver.id,
        name: driver.name,
        vehicle: driver.vehicle_type
      }
    });
  } catch (err) {
    console.error('Assign driver error:', err);
    res.status(500).json({ error: 'Failed to assign driver to shipment.' });
  }
});

// 4. Get System Users List
router.get('/users', async (req, res) => {
  try {
    const db = await getDB();
    const { role } = req.query;

    let query = `SELECT id, name, email, role, phone, vehicle_type, status, created_at FROM users`;
    const params = [];

    if (role) {
      query += ` WHERE role = ?`;
      params.push(role);
    }

    query += ` ORDER BY created_at DESC`;

    const users = await db.all(query, params);
    res.json({ users });
  } catch (err) {
    console.error('Admin user list error:', err);
    res.status(500).json({ error: 'Failed to fetch user directory.' });
  }
});

// 5. Create Driver Account
router.post('/drivers', async (req, res) => {
  try {
    const { name, email, password, phone, vehicle_type } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const db = await getDB();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const result = await db.run(`
      INSERT INTO users (name, email, password, role, phone, vehicle_type, status, created_at)
      VALUES (?, ?, ?, 'driver', ?, ?, 'active', ?)
    `, [name.trim(), email.toLowerCase().trim(), hashedPassword, phone || '', vehicle_type || 'Standard Delivery Van', now]);

    await recordAuditLog(req.user.id, 'DRIVER_CREATED', `Admin created driver account: ${email}`);

    res.status(201).json({
      message: 'Driver account created successfully!',
      driver: {
        id: result.lastID,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: 'driver',
        phone,
        vehicle_type
      }
    });
  } catch (err) {
    console.error('Create driver error:', err);
    res.status(500).json({ error: 'Failed to create driver account.' });
  }
});

// 6. View Audit Logs
router.get('/audit-logs', async (req, res) => {
  try {
    const db = await getDB();
    const logs = await db.all(`
      SELECT al.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT 100
    `);

    res.json({ logs });
  } catch (err) {
    console.error('Admin audit logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

module.exports = router;
