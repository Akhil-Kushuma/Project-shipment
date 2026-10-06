const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;

  let dbPath;
  if (process.env.VERCEL) {
    dbPath = path.join('/tmp', 'shiptrack.db');
    const bundledDb = path.join(__dirname, 'shiptrack.db');
    if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) {
      try {
        fs.copyFileSync(bundledDb, dbPath);
        console.log('[DB] Copied bundled database to /tmp/shiptrack.db for Vercel serverless.');
      } catch (e) {
        console.error('[DB] Failed to copy bundled database to /tmp:', e);
      }
    }
  } else {
    dbPath = path.join(__dirname, 'shiptrack.db');
  }

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await dbInstance.run('PRAGMA foreign_keys = ON;');
  await initializeSchema(dbInstance);
  return dbInstance;
}

async function initializeSchema(db) {
  // 1. Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('customer', 'driver', 'admin')) NOT NULL DEFAULT 'customer',
      phone TEXT,
      vehicle_type TEXT,
      status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
      created_at TEXT NOT NULL
    );
  `);

  // 2. Shipments Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER NOT NULL,
      driver_id INTEGER,
      sender_name TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      sender_city TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      recipient_city TEXT NOT NULL,
      package_type TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      dimensions TEXT,
      declared_value REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      status TEXT CHECK(status IN ('CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'CANCELLED')) NOT NULL DEFAULT 'CREATED',
      current_location TEXT NOT NULL,
      estimated_delivery TEXT NOT NULL,
      special_instructions TEXT,
      proof_of_delivery TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (driver_id) REFERENCES users(id)
    );
  `);

  // 3. Status Updates Timeline Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS status_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      updated_by_user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      location TEXT NOT NULL,
      notes TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
    );
  `);

  // 4. Audit Logs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 5. Support Tickets Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT UNIQUE NOT NULL,
      tracking_number TEXT,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT CHECK(priority IN ('Low', 'Standard', 'High', 'Urgent')) DEFAULT 'High',
      status TEXT CHECK(status IN ('Open', 'In Review', 'Resolved', 'Closed')) DEFAULT 'Open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await seedDefaultData(db);
}

async function seedDefaultData(db) {
  const demoCheck = await db.get('SELECT id FROM users WHERE email = ?', ['admin@shiptrack.demo']);
  if (!demoCheck) {
    const hashedPasswordAdmin = await bcrypt.hash('Admin@123', 10);
    await db.run(
      `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['System Admin', 'admin@shiptrack.demo', hashedPasswordAdmin, 'admin', '+91 98765 43210', new Date().toISOString()]
    );
  }

  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count > 0) return;

  console.log('[DB] Seeding Indian Logistics demo dataset & support tickets...');
  
  const now = new Date().toISOString();
  const hashedPasswordAdmin = await bcrypt.hash('Admin@123', 10);
  const hashedPasswordDriver = await bcrypt.hash('Driver@123', 10);
  const hashedPasswordCustomer = await bcrypt.hash('Customer@123', 10);

  // 1. Admin
  const adminRes = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['System Administrator', 'admin@shiptrack.com', hashedPasswordAdmin, 'admin', '+91 98765 43210', now]
  );
  await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['System Admin', 'admin@shiptrack.demo', hashedPasswordAdmin, 'admin', '+91 98765 43210', now]
  );

  // 2. Drivers (Alex River, Ravi Kumar, Priya Singh)
  const d1Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, vehicle_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Alex River', 'driver1@shiptrack.com', hashedPasswordDriver, 'driver', '+91 98765 11111', 'Express Van', now]
  );
  const d2Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, vehicle_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Ravi Kumar', 'driver2@shiptrack.com', hashedPasswordDriver, 'driver', '+91 98765 22222', 'Cargo Truck', now]
  );
  const d3Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, vehicle_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Priya Singh', 'driver3@shiptrack.com', hashedPasswordDriver, 'driver', '+91 98765 33333', 'Delivery Van', now]
  );

  // 3. Customers (Jane Doe, Robert Smith)
  const c1Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Jane Doe', 'customer1@shiptrack.com', hashedPasswordCustomer, 'customer', '+91 98765 44444', now]
  );
  const c2Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Robert Smith', 'customer2@shiptrack.com', hashedPasswordCustomer, 'customer', '+91 98765 55555', now]
  );

  const adminId = adminRes.lastID;
  const d1 = d1Res.lastID; // Alex River
  const d2 = d2Res.lastID; // Ravi Kumar
  const d3 = d3Res.lastID; // Priya Singh
  const c1 = c1Res.lastID; // Jane Doe
  const c2 = c2Res.lastID; // Robert Smith

  const estOct7 = '2026-10-07T18:00:00.000Z';
  const estToday = new Date().toISOString();
  const estOct3 = '2026-10-03T14:30:00.000Z';
  const estOct8 = '2026-10-08T11:00:00.000Z';
  const estOct9 = '2026-10-09T16:00:00.000Z';

  // Shipment 1: TRK-2026-894120
  const s1 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-894120', c1, d1, 'Jane Doe', '+91 98765 44444', 'HITEC City, Phase 2', 'Hyderabad',
    'Rahul Sharma', '+91 91234 56789', '100 Silicon Highway', 'Hyderabad', 'Electronics', 3.5,
    '30x20x15 cm', 12500, 850, 'IN_TRANSIT', 'Hyderabad Distribution Center Hub', estOct7,
    'Fragile handle with care. Contains high precision sensors.', now, now
  ]);

  // Shipment 2: TRK-2026-302194
  const s2 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-302194', c1, d2, 'Jane Doe', '+91 98765 44444', 'Banjara Hills, Road #12', 'Hyderabad',
    'Priya Reddy', '+91 98111 22233', 'Koramangala 4th Block', 'Bengaluru', 'Documents', 0.8,
    '25x15x5 cm', 2000, 420, 'OUT_FOR_DELIVERY', 'Bengaluru South Delivery Route #4', estToday,
    'Urgent legal documents. Deliver to reception desk.', now, now
  ]);

  // Shipment 3: TRK-2026-110482
  const s3 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, proof_of_delivery, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-110482', c1, d1, 'Jane Doe', '+91 98765 44444', 'Andheri East', 'Mumbai',
    'Arjun Kumar', '+91 97777 88888', 'Connaught Place', 'Delhi', 'Clothing', 2.2,
    '35x25x10 cm', 4500, 650, 'DELIVERED', 'Delhi Hub Destination Address', estOct3,
    'Standard apparel package.', 'Handed to Arjun Kumar at 14:32 IST', now, now
  ]);

  // Shipment 4: TRK-2026-554109
  const s4 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-554109', c1, d3, 'Jane Doe', '+91 98765 44444', 'FC Road', 'Pune',
    'Sneha Patel', '+91 93333 44444', 'T Nagar', 'Chennai', 'Cold Storage', 4.0,
    '30x30x20 cm', 25000, 1200, 'PICKED_UP', 'Pune Regional Logistics Facility', estOct8,
    'Keep under 4 degrees Celsius at all times.', now, now
  ]);

  // Shipment 5: TRK-2026-778231
  const s5 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-778231', c2, null, 'Robert Smith', '+91 98765 55555', 'Nehru Place', 'Delhi',
    'Vikram Malhotra', '+91 94444 55555', 'Gachibowli', 'Hyderabad', 'Heavy Cargo', 15.0,
    '80x60x50 cm', 35000, 1950, 'CREATED', 'Delhi Origin Warehouse Dispatch', estOct9,
    'Palletized equipment. Heavy lift gear needed.', now, now
  ]);

  // Timeline Logs Seed
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, c1, 'CREATED', 'HITEC City Dispatch, Hyderabad', 'Shipment created by sender Jane Doe.', '2026-10-05T10:00:00.000Z']);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, d1, 'PICKED_UP', 'Hyderabad Central Hub', 'Picked up by Courier Alex River (Express Van).', '2026-10-05T14:20:00.000Z']);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, d1, 'IN_TRANSIT', 'Hyderabad Distribution Center Hub', 'Scanned at regional sorting facility.', '2026-10-05T18:45:00.000Z']);

  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s2.lastID, c1, 'CREATED', 'Banjara Hills, Hyderabad', 'Registered express document shipment.', '2026-10-05T09:15:00.000Z']);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s2.lastID, d2, 'IN_TRANSIT', 'NH44 Highway Hub', 'Transit scan completed.', '2026-10-05T15:30:00.000Z']);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s2.lastID, d2, 'OUT_FOR_DELIVERY', 'Bengaluru South Delivery Route #4', 'Driver Ravi Kumar out for delivery.', '2026-10-05T21:10:00.000Z']);

  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s3.lastID, c1, 'CREATED', 'Andheri Warehouse, Mumbai', 'Shipment created.', '2026-10-02T08:00:00.000Z']);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s3.lastID, d1, 'DELIVERED', 'Connaught Place, Delhi', 'Delivered & signed by Arjun Kumar.', '2026-10-03T14:30:00.000Z']);

  // Support Tickets Seed
  await db.run(`
    INSERT INTO support_tickets (ticket_id, tracking_number, customer_name, email, phone, category, description, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'SUP-2026-10482', 'TRK-2026-894120', 'Jane Doe', 'customer1@shiptrack.com', '+91 98765 44444',
    'Late Delivery', 'Package TRK-2026-894120 status is delayed at Hyderabad sorting center.', 'High', 'Open', now, now
  ]);

  await db.run(`
    INSERT INTO support_tickets (ticket_id, tracking_number, customer_name, email, phone, category, description, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'SUP-2026-22194', 'TRK-2026-302194', 'Priya Reddy', 'priya@example.com', '+91 98111 22233',
    'Refund & Payment Issue', 'Requesting express fee refund due to delivery timing update.', 'Standard', 'In Review', now, now
  ]);

  // Audit Logs Seed
  await db.run(`INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'SYSTEM_INITIALIZATION', 'Seeded Indian Logistics demo dataset and support tickets.', '127.0.0.1', now]);
  await db.run(`INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [c1, 'SUPPORT_TICKET_CREATED', 'Jane Doe submitted support ticket SUP-2026-10482', '127.0.0.1', now]);

  console.log('[DB] Seeding completed successfully!');
}

module.exports = { getDB };
