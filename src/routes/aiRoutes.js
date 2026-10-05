const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');
const { optionalAuth } = require('../middleware/auth');

router.post('/chat', optionalAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const trimmedMsg = message.trim();
    const db = await getDB();
    let reply = "";
    let actionData = null;

    // Regex check for tracking number in user prompt (e.g. TRK-2026-894120)
    const trkMatch = trimmedMsg.match(/TRK-\d{4}-\d+/i);

    if (trkMatch) {
      const trackingNumber = trkMatch[0].toUpperCase();
      const shipment = await db.get(`
        SELECT s.*, u.name as driver_name, u.phone as driver_phone
        FROM shipments s
        LEFT JOIN users u ON s.driver_id = u.id
        WHERE s.tracking_number = ?
      `, [trackingNumber]);

      if (!shipment) {
        reply = `I looked up **${trackingNumber}** in our live logistics database, but I couldn't find an active shipment record with that tracking number. Please verify your tracking ID and try again!`;
      } else {
        const updates = await db.all(
          `SELECT status, location, notes, timestamp FROM status_updates WHERE shipment_id = ? ORDER BY timestamp DESC`,
          [shipment.id]
        );

        const estDate = new Date(shipment.estimated_delivery).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        reply = `Here is the live status for **${shipment.tracking_number}**:\n\n` +
          `• **Current Status**: \`${shipment.status}\`\n` +
          `• **Current Location**: ${shipment.current_location}\n` +
          `• **Recipient**: ${shipment.recipient_name} (${shipment.recipient_city})\n` +
          `• **Package Type**: ${shipment.package_type} (${shipment.weight_kg} kg)\n` +
          `• **Estimated Delivery**: ${estDate}\n` +
          (shipment.driver_name ? `• **Assigned Courier**: ${shipment.driver_name} (${shipment.driver_phone})\n` : `• **Assigned Courier**: Pending dispatch\n`) +
          `\n**Recent Activity Log:**\n` +
          updates.slice(0, 3).map(u => `  - *${new Date(u.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}*: [${u.status}] at ${u.location} — ${u.notes || 'Status updated'}`).join('\n');

        actionData = {
          type: 'SHIPMENT_FOUND',
          trackingNumber: shipment.tracking_number,
          shipmentId: shipment.id,
          status: shipment.status
        };
      }
    } else if (trimmedMsg.toLowerCase().includes('cost') || trimmedMsg.toLowerCase().includes('price') || trimmedMsg.toLowerCase().includes('rate')) {
      reply = `**ShipTrack Shipping Rate Guide:**\n\n` +
        `Our dynamic pricing model is calculated using package type base rates + $3.50 per kg:\n\n` +
        `• **Standard Shipping**: $10.00 base + $3.50/kg (Est. 3-4 days)\n` +
        `• **Express Freight**: $25.00 base + $3.50/kg (Est. 1-2 days priority delivery)\n` +
        `• **Fragile Goods**: $30.00 base + $3.50/kg (Includes extra padding & high-care handling)\n` +
        `• **Cold Storage / Perishable**: $45.00 base + $3.50/kg (Temperature-controlled transport)\n` +
        `• **Heavy Cargo**: $60.00 base + $3.50/kg (Palletized transport)\n\n` +
        `*Tip: You can use our Create Shipment form to calculate exact costs instantly!*`;
    } else if (trimmedMsg.toLowerCase().includes('my shipment') || trimmedMsg.toLowerCase().includes('my package') || trimmedMsg.toLowerCase().includes('history')) {
      if (req.user && req.user.role === 'customer') {
        const userShipments = await db.all(
          `SELECT tracking_number, recipient_name, recipient_city, status, estimated_delivery FROM shipments WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`,
          [req.user.id]
        );

        if (userShipments.length === 0) {
          reply = `You haven't created any shipments yet! Click **'Create Shipment'** on your dashboard to send your first package.`;
        } else {
          reply = `Here are your recent shipments, **${req.user.name}**:\n\n` +
            userShipments.map(s => `• **${s.tracking_number}** → ${s.recipient_name} (${s.recipient_city}) — Status: \`${s.status}\``).join('\n') +
            `\n\nTo view full timeline details, reply with any tracking number (e.g. \`${userShipments[0].tracking_number}\`).`;
        }
      } else {
        reply = `Please log in to your Customer account to view your personal shipment history automatically!`;
      }
    } else if (trimmedMsg.toLowerCase().includes('help') || trimmedMsg.toLowerCase().includes('hello') || trimmedMsg.toLowerCase().includes('hi')) {
      reply = `Hello! I'm **ShipBot AI**, your intelligent logistics assistant.\n\nHere is how I can assist you today:\n` +
        `1. **Track a Package**: Paste any tracking number (e.g., \`TRK-2026-894120\`).\n` +
        `2. **Check Shipping Rates**: Ask "How much does shipping cost?".\n` +
        `3. **View Personal History**: Ask "Show my active shipments".\n` +
        `4. **Delivery Policies**: Ask about fragile items, cold storage, or express speed.`;
    } else {
      reply = `I am **ShipBot AI**. I can assist you with live tracking, rate estimates, courier info, and shipment status!\n\nTry asking me:\n` +
        `• *"Where is package TRK-2026-894120?"*\n` +
        `• *"How much does a 4kg express shipment cost?"*\n` +
        `• *"What are the delivery steps?"*`;
    }

    res.json({
      reply,
      actionData,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI Assistant failed to process prompt.' });
  }
});

module.exports = router;
