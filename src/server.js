const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDB } = require('./db/database');

const authRoutes = require('./routes/authRoutes');
const shipmentRoutes = require('./routes/shipmentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Security & CORS Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// API Health Check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDB();
    const result = await db.get('SELECT 1 as alive');
    res.json({
      status: 'healthy',
      service: 'ShipTrack Logistics API',
      timestamp: new Date().toISOString(),
      database: result && result.alive === 1 ? 'connected' : 'degraded'
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);

// Serve static frontend files if built
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Fallback route for SPA client side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  const indexPath = path.join(publicPath, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>ShipTrack API Server</title></head>
        <body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
          <h1>🚢 ShipTrack Logistics API Server</h1>
          <p>Status: <span style="color: #4ade80;">Active & Running</span></p>
          <p>Health check endpoint: <a href="/api/health" style="color: #38bdf8;">/api/health</a></p>
        </body>
      </html>
    `);
  }
});

// Initialize DB and start server
async function startServer() {
  try {
    await getDB();
    console.log('[DB] Database initialized successfully.');
    app.listen(PORT, () => {
      console.log(`[SERVER] ShipTrack backend server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
