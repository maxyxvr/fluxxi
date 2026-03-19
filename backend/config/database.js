const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../fluxxi2.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'Offline',
    active_orders INTEGER DEFAULT 0,
    lat REAL,
    lng REAL,
    last_seen DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    address TEXT NOT NULL,
    lat REAL,
    lng REAL,
    driver_id INTEGER REFERENCES drivers(id),
    status TEXT DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migraciones no destructivas
const driverCols = db.pragma('table_info(drivers)').map(c => c.name);
if (!driverCols.includes('lat'))       db.exec('ALTER TABLE drivers ADD COLUMN lat REAL');
if (!driverCols.includes('lng'))       db.exec('ALTER TABLE drivers ADD COLUMN lng REAL');
if (!driverCols.includes('last_seen')) db.exec('ALTER TABLE drivers ADD COLUMN last_seen DATETIME');

const orderCols = db.pragma('table_info(orders)').map(c => c.name);
if (!orderCols.includes('lat')) db.exec('ALTER TABLE orders ADD COLUMN lat REAL');
if (!orderCols.includes('lng')) db.exec('ALTER TABLE orders ADD COLUMN lng REAL');

module.exports = db;
