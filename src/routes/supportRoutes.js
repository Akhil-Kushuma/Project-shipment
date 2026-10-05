const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { authenticateToken, requireRole, optionalAuth, recordAuditLog } = require('../middleware/auth');

// Utility: Generate Support Ticket ID
function generateTicketId() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `SUP-${year}-${randomNum}`;
}

// 1. Submit Support Ticket (Public / Customer)
router.post('/tickets', optionalAuth, async (req, res) => {
  try {
    const { category, tracking_number, customer_name, email, phone = '', description } = req.body;

    if (!category || !customer_name || !email || !description) {
      return res.status(400).json({ error: 'Category, Customer Name, Email, and Description are required fields.' });
    }

    const db = await getDB();
    const ticketId = generateTicketId();
    const now = new Date().toISOString();

    // Check if tracking number is valid in system
    let validShipment = null;
    if (tracking_number) {
      validShipment = await db.get('SELECT * FROM shipments WHERE tracking_number = ?', [tracking_number.trim().toUpperCase()]);
    }

    const result = await db.run(`
      INSERT INTO support_tickets (
        ticket_id, tracking_number, customer_name, email, phone, category, description, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketId,
      tracking_number ? tracking_number.trim().toUpperCase() : '',
      customer_name.trim(),
      email.trim(),
      phone.trim(),
      category,
      description.trim(),
      'High',
      'Open',
      now,
      now
    ]);

    await recordAuditLog(
      req.user ? req.user.id : null,
      'SUPPORT_TICKET_CREATED',
      `Support ticket ${ticketId} created for issue '${category}' (Tracking: ${tracking_number || 'N/A'})`
    );

    res.status(201).json({
      message: 'Support request submitted successfully!',
      ticket: {
        id: result.lastID,
        ticket_id: ticketId,
        category,
        tracking_number: tracking_number ? tracking_number.trim().toUpperCase() : null,
        shipment: validShipment ? {
          tracking_number: validShipment.tracking_number,
          status: validShipment.status,
          current_location: validShipment.current_location,
          estimated_delivery: validShipment.estimated_delivery
        } : null,
        status: 'Open',
        created_at: now
      }
    });
  } catch (err) {
    console.error('Support ticket creation error:', err);
    res.status(500).json({ error: 'Failed to submit support ticket request.' });
  }
});

// 2. Get All Support Tickets (Admin Only)
router.get('/tickets', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDB();
    const tickets = await db.all('SELECT * FROM support_tickets ORDER BY created_at DESC');
    res.json({ tickets });
  } catch (err) {
    console.error('Fetch support tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch support tickets.' });
  }
});

// 3. Update Support Ticket Status (Admin Only)
router.put('/tickets/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Open', 'In Review', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const db = await getDB();
    const ticket = await db.get('SELECT * FROM support_tickets WHERE id = ?', [id]);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    const now = new Date().toISOString();
    await db.run('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);

    await recordAuditLog(
      req.user.id,
      'SUPPORT_TICKET_UPDATED',
      `Admin updated support ticket ${ticket.ticket_id} status to ${status}`
    );

    res.json({
      message: `Support ticket ${ticket.ticket_id} status updated to ${status}.`,
      status
    });
  } catch (err) {
    console.error('Update support ticket error:', err);
    res.status(500).json({ error: 'Failed to update support ticket.' });
  }
});

module.exports = router;
