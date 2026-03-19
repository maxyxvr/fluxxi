const db = require('../config/database');

const Order = {
  getAll() {
    return db.prepare(`
      SELECT o.*, d.name as driver_name
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      ORDER BY o.created_at DESC
    `).all();
  },

  getByDriver(driverId) {
    return db.prepare(`
      SELECT o.*, d.name as driver_name
      FROM orders o
      LEFT JOIN drivers d ON o.driver_id = d.id
      WHERE o.driver_id = ? AND o.status NOT IN ('Delivered','Cancelled')
      ORDER BY o.created_at ASC
    `).all(driverId);
  },

  getById(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  },

  create({ order_code, customer_name, customer_phone, address, lat, lng }) {
    const stmt = db.prepare(
      'INSERT INTO orders (order_code, customer_name, customer_phone, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(order_code, customer_name, customer_phone || null, address, lat || null, lng || null);
    return this.getById(result.lastInsertRowid);
  },

  assignDriver(orderId, driverId) {
    db.prepare(
      "UPDATE orders SET driver_id = ?, status = 'Assigned' WHERE id = ?"
    ).run(driverId, orderId);
    return this.getById(orderId);
  },

  updateStatus(id, status) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return this.getById(id);
  }
};

module.exports = Order;
