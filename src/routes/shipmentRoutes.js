const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { authenticateToken, requireRole, recordAuditLog } = require('../middleware/auth');

// Utility: Generate Tracking Number
function generateTrackingNumber() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `TRK-${year}-${randomNum}`;
}

// Utility: Calculate Shipping Cost
function calculateShippingCost(weightKg, packageType) {
  let baseCost = 10.0;
  if (packageType === 'Express') baseCost = 25.0;
  else if (packageType === 'Fragile') baseCost = 30.0;
  else if (packageType === 'Cold Storage') baseCost = 45.0;
  else if (packageType === 'Heavy Cargo') baseCost = 60.0;

  const weightCost = weightKg * 3.5;
  return parseFloat((baseCost + weightCost).toFixed(2));
}

// 1. Public Tracking Lookup
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const db = await getDB();

    const shipment = await db.get(`
      SELECT s.*, u.name as driver_name, u.phone as driver_phone, u.vehicle_type as driver_vehicle
      FROM shipments s
      LEFT JOIN users u ON s.driver_id = u.id
      WHERE s.tracking_number = ?
    `, [trackingNumber.trim().toUpperCase()]);

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment with specified tracking number not found.' });
    }

    const updates = await db.all(`
      SELECT su.*, u.name as updated_by_name, u.role as updated_by_role
      FROM status_updates su
      LEFT JOIN users u ON su.updated_by_user_id = u.id
      WHERE su.shipment_id = ?
      ORDER BY su.timestamp ASC
    `, [shipment.id]);

    res.json({
      shipment: {
        id: shipment.id,
        tracking_number: shipment.tracking_number,
        status: shipment.status,
        sender_city: shipment.sender_city,
        recipient_name: shipment.recipient_name,
        recipient_city: shipment.recipient_city,
        package_type: shipment.package_type,
        weight_kg: shipment.weight_kg,
        dimensions: shipment.dimensions,
        current_location: shipment.current_location,
        estimated_delivery: shipment.estimated_delivery,
        special_instructions: shipment.special_instructions,
        proof_of_delivery: shipment.proof_of_delivery,
        driver: shipment.driver_name ? {
          name: shipment.driver_name,
          phone: shipment.driver_phone,
          vehicle: shipment.driver_vehicle
        } : null,
        created_at: shipment.created_at,
        updated_at: shipment.updated_at
      },
      timeline: updates
    });
  } catch (err) {
    console.error('Tracking lookup error:', err);
    res.status(500).json({ error: 'Failed to retrieve tracking information.' });
  }
});

// 2. Create Shipment (Customer or Admin)
router.post('/', authenticateToken, requireRole('customer', 'admin'), async (req, res) => {
  try {
    const {
      sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city,
      package_type = 'Standard', weight_kg, dimensions = '', declared_value = 0,
      special_instructions = ''
    } = req.body;

    if (!sender_name || !sender_address || !recipient_name || !recipient_address || !weight_kg) {
      return res.status(400).json({ error: 'Please provide all required sender, recipient, and package weight details.' });
    }

    const weightNum = parseFloat(weight_kg);
    if (isNaN(weightNum) || weightNum <= 0) {
      return res.status(400).json({ error: 'Package weight must be a positive number.' });
    }

    const db = await getDB();
    const trackingNumber = generateTrackingNumber();
    const shippingCost = calculateShippingCost(weightNum, packageType);

    // Calculate Estimated Delivery (2 days for express, 4 days for standard)
    const daysToAdd = packageType === 'Express' ? 2 : 4;
    const estDelivery = new Date(Date.now() + 86400000 * daysToAdd).toISOString();
    const now = new Date().toISOString();

    const customerId = req.user.role === 'customer' ? req.user.id : (req.body.customer_id || req.user.id);

    const result = await db.run(`
      INSERT INTO shipments (
        tracking_number, customer_id, sender_name, sender_phone, sender_address, sender_city,
        recipient_name, recipient_phone, recipient_address, recipient_city, package_type,
        weight_kg, dimensions, declared_value, shipping_cost, status, current_location,
        estimated_delivery, special_instructions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      trackingNumber, customerId, sender_name, sender_phone || '', sender_address, sender_city || '',
      recipient_name, recipient_phone || '', recipient_address, recipient_city || '', package_type,
      weightNum, dimensions, parseFloat(declared_value) || 0, shippingCost, 'CREATED',
      `${sender_city || 'Origin'} Facility - Received`, estDelivery, special_instructions, now, now
    ]);

    const shipmentId = result.lastID;

    // Record initial status entry
    await db.run(`
      INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [shipmentId, req.user.id, 'CREATED', `${sender_city || 'Origin'} Logistics Hub`, 'Shipment registered in platform.', now]);

    await recordAuditLog(req.user.id, 'SHIPMENT_CREATED', `Created shipment ${trackingNumber} for recipient ${recipient_name}`);

    res.status(201).json({
      message: 'Shipment created successfully!',
      shipment: {
        id: shipmentId,
        tracking_number: trackingNumber,
        status: 'CREATED',
        shipping_cost: shippingCost,
        estimated_delivery: estDelivery,
        created_at: now
      }
    });
  } catch (err) {
    console.error('Create shipment error:', err);
    res.status(500).json({ error: 'Failed to create new shipment.' });
  }
});

// 3. Customer Shipment History
router.get('/my-shipments', authenticateToken, requireRole('customer'), async (req, res) => {
  try {
    const db = await getDB();
    const { status, search } = req.query;

    let query = `
      SELECT s.*, u.name as driver_name, u.phone as driver_phone
      FROM shipments s
      LEFT JOIN users u ON s.driver_id = u.id
      WHERE s.customer_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (s.tracking_number LIKE ? OR s.recipient_name LIKE ? OR s.recipient_city LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY s.created_at DESC`;

    const shipments = await db.all(query, params);
    res.json({ shipments });
  } catch (err) {
    console.error('Customer shipment history error:', err);
    res.status(500).json({ error: 'Failed to fetch customer shipment history.' });
  }
});

// 4. Driver Assigned Deliveries
router.get('/driver-shipments', authenticateToken, requireRole('driver'), async (req, res) => {
  try {
    const db = await getDB();
    const { status } = req.query;

    let query = `
      SELECT s.*, c.name as customer_name, c.phone as customer_phone
      FROM shipments s
      LEFT JOIN users c ON s.customer_id = c.id
      WHERE s.driver_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY CASE s.status 
      WHEN 'OUT_FOR_DELIVERY' THEN 1 
      WHEN 'IN_TRANSIT' THEN 2 
      WHEN 'PICKED_UP' THEN 3 
      WHEN 'CREATED' THEN 4 
      ELSE 5 END, s.updated_at DESC`;

    const shipments = await db.all(query, params);
    res.json({ shipments });
  } catch (err) {
    console.error('Driver shipment history error:', err);
    res.status(500).json({ error: 'Failed to fetch assigned deliveries.' });
  }
});

// 5. Detailed Shipment View
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDB();

    const shipment = await db.get(`
      SELECT s.*, c.name as customer_name, c.email as customer_email,
             d.name as driver_name, d.phone as driver_phone, d.vehicle_type as driver_vehicle
      FROM shipments s
      LEFT JOIN users c ON s.customer_id = c.id
      LEFT JOIN users d ON s.driver_id = d.id
      WHERE s.id = ?
    `, [id]);

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment record not found.' });
    }

    // Access control check: Must be owner customer, assigned driver, or admin
    if (req.user.role === 'customer' && shipment.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this shipment record.' });
    }
    if (req.user.role === 'driver' && shipment.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You are not assigned to this shipment.' });
    }

    const updates = await db.all(`
      SELECT su.*, u.name as updated_by_name, u.role as updated_by_role
      FROM status_updates su
      LEFT JOIN users u ON su.updated_by_user_id = u.id
      WHERE su.shipment_id = ?
      ORDER BY su.timestamp ASC
    `, [id]);

    res.json({ shipment, timeline: updates });
  } catch (err) {
    console.error('Shipment detail error:', err);
    res.status(500).json({ error: 'Failed to fetch shipment details.' });
  }
});

// 6. Update Shipment Delivery Status (Driver or Admin)
router.put('/:id/status', authenticateToken, requireRole('driver', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, location, notes = '', proof_of_delivery = '' } = req.body;

    const validStatuses = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (!location) {
      return res.status(400).json({ error: 'Current location is required for status updates.' });
    }

    const db = await getDB();
    const shipment = await db.get('SELECT * FROM shipments WHERE id = ?', [id]);

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment record not found.' });
    }

    // Driver restriction check: Must be assigned driver or admin
    if (req.user.role === 'driver' && shipment.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to update this shipment.' });
    }

    const now = new Date().toISOString();

    // Update shipment table
    await db.run(`
      UPDATE shipments
      SET status = ?, current_location = ?, proof_of_delivery = ?, updated_at = ?
      WHERE id = ?
    `, [status, location, proof_of_delivery || shipment.proof_of_delivery, now, id]);

    // Insert timeline record
    await db.run(`
      INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, req.user.id, status, location, notes, now]);

    await recordAuditLog(
      req.user.id,
      'STATUS_UPDATED',
      `Shipment ${shipment.tracking_number} status changed to ${status} at ${location}`
    );

    res.json({
      message: `Shipment status successfully updated to ${status}.`,
      status,
      current_location: location,
      updated_at: now
    });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'Failed to update shipment status.' });
  }
});

module.exports = router;
