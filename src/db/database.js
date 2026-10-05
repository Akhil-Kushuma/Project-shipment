const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;

  const dbPath = path.join(__dirname, 'shiptrack.db');
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
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

  // Seed default users and sample data if database is empty
  await seedDefaultData(db);
}

async function seedDefaultData(db) {
  const userCount = await db.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count > 0) return;

  console.log('[DB] Seeding default users and shipments...');
  
  const now = new Date().toISOString();
  const hashedPasswordAdmin = await bcrypt.hash('Admin@123', 10);
  const hashedPasswordDriver = await bcrypt.hash('Driver@123', 10);
  const hashedPasswordCustomer = await bcrypt.hash('Customer@123', 10);

  // Insert Admin
  const adminRes = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['System Administrator', 'admin@shiptrack.com', hashedPasswordAdmin, 'admin', '+1 (555) 019-2831', now]
  );

  // Insert Drivers
  const driver1Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, vehicle_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Alex River', 'driver1@shiptrack.com', hashedPasswordDriver, 'driver', '+1 (555) 014-9922', 'Express Cargo Van', now]
  );
  const driver2Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, vehicle_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Sam Morgan', 'driver2@shiptrack.com', hashedPasswordDriver, 'driver', '+1 (555) 018-3344', 'Electric Scooter', now]
  );

  // Insert Customers
  const customer1Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Jane Doe', 'customer1@shiptrack.com', hashedPasswordCustomer, 'customer', '+1 (555) 012-3456', now]
  );
  const customer2Res = await db.run(
    `INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Robert Smith', 'customer2@shiptrack.com', hashedPasswordCustomer, 'customer', '+1 (555) 017-8899', now]
  );

  const customer1Id = customer1Res.lastID;
  const customer2Id = customer2Res.lastID;
  const driver1Id = driver1Res.lastID;
  const driver2Id = driver2Res.lastID;
  const adminId = adminRes.lastID;

  // Sample Shipments
  const estDelivery1 = new Date(Date.now() + 86400000 * 2).toISOString();
  const estDelivery2 = new Date(Date.now() + 86400000 * 1).toISOString();
  const estDelivery3 = new Date(Date.now() - 86400000 * 1).toISOString();

  // Shipment 1: In Transit
  const s1 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-894120', customer1Id, driver1Id, 'Jane Doe', '+1 (555) 012-3456', '742 Evergreen Terrace', 'Springfield',
    'Tech Supplies Inc.', '+1 (555) 998-1122', '100 Silicon Way', 'San Jose', 'Express', 3.5,
    '30x20x15 cm', 450.00, 24.50, 'IN_TRANSIT', 'Sorting Hub Central, Denver, CO', estDelivery1,
    'Handle with care - contains fragile electronics.', now, now
  ]);

  // Shipment 2: Out for Delivery
  const s2 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-302194', customer1Id, driver2Id, 'Jane Doe', '+1 (555) 012-3456', '742 Evergreen Terrace', 'Springfield',
    'Michael Scott', '+1 (555) 321-7654', '1725 Slough Avenue', 'Scranton', 'Standard', 1.2,
    '20x15x10 cm', 85.00, 12.00, 'OUT_FOR_DELIVERY', 'Scranton Local Delivery Van #4', estDelivery2,
    'Leave at front porch if no answer.', now, now
  ]);

  // Shipment 3: Delivered
  const s3 = await db.run(`
    INSERT INTO shipments (
      tracking_number, customer_id, driver_id, sender_name, sender_phone, sender_address, sender_city,
      recipient_name, recipient_phone, recipient_address, recipient_city, package_type, weight_kg,
      dimensions, declared_value, shipping_cost, status, current_location, estimated_delivery,
      special_instructions, proof_of_delivery, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'TRK-2026-110482', customer2Id, driver1Id, 'Robert Smith', '+1 (555) 017-8899', '124 Conch Street', 'Bikini Bottom',
    'Sarah Connor', '+1 (555) 443-2211', '455 SkyNet Plaza', 'Los Angeles', 'Fragile', 5.0,
    '40x30x20 cm', 1200.00, 48.00, 'DELIVERED', 'Destination Address - Front Reception', estDelivery3,
    'Signature required upon receipt.', 'Signed by S. Connor at 14:32 PM', now, now
  ]);

  // Status Updates Seed
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, customer1Id, 'CREATED', 'Origin Dispatch, Springfield', 'Shipment registered by customer.', now]);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, driver1Id, 'PICKED_UP', 'Origin Logistics Hub', 'Package received from sender.', now]);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s1.lastID, driver1Id, 'IN_TRANSIT', 'Sorting Hub Central, Denver, CO', 'Scanned at regional sorting facility.', now]);

  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s2.lastID, customer1Id, 'CREATED', 'Origin Dispatch, Springfield', 'Shipment registered by customer.', now]);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s2.lastID, driver2Id, 'OUT_FOR_DELIVERY', 'Scranton Local Delivery Van #4', 'Driver out for final mile delivery.', now]);

  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s3.lastID, customer2Id, 'CREATED', 'Origin Dispatch', 'Shipment registered.', now]);
  await db.run(`INSERT INTO status_updates (shipment_id, updated_by_user_id, status, location, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
    [s3.lastID, driver1Id, 'DELIVERED', 'Destination Address', 'Delivered successfully and signed for.', now]);

  // Audit log seed
  await db.run(`INSERT INTO audit_logs (user_id, action, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?)`,
    [adminId, 'SYSTEM_INITIALIZATION', 'Seeded initial users, drivers, and sample logistics data.', '127.0.0.1', now]);

  console.log('[DB] Seeding completed successfully!');
}

module.exports = { getDB };
