const db = require('../config/database');

const Driver = {
  getAll() {
    return db.prepare('SELECT * FROM drivers ORDER BY created_at DESC').all();
  },

  getById(id) {
    return db.prepare('SELECT * FROM drivers WHERE id = ?').get(id);
  },

  getAvailable() {
    return db.prepare(
      "SELECT * FROM drivers WHERE status = 'Available' ORDER BY active_orders ASC LIMIT 1"
    ).get();
  },

  getBestForAssignment() {
    // Preferir driver Busy con < 3 pedidos (llenar primero hasta el mínimo)
    const busy = db.prepare(
      "SELECT * FROM drivers WHERE status = 'Busy' AND active_orders < 3 ORDER BY active_orders DESC LIMIT 1"
    ).get();
    if (busy) return busy;
    // Si no, tomar driver Available con menos pedidos
    return db.prepare(
      "SELECT * FROM drivers WHERE status = 'Available' ORDER BY active_orders ASC LIMIT 1"
    ).get();
  },

  create({ name }) {
    const stmt = db.prepare("INSERT INTO drivers (name, status) VALUES (?, 'Offline')");
    const result = stmt.run(name);
    return this.getById(result.lastInsertRowid);
  },

  setWaiting(id) {
    db.prepare("UPDATE drivers SET status = 'Waiting' WHERE id = ?").run(id);
    return this.getById(id);
  },

  liberar(id) {
    db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(id);
    return this.getById(id);
  },

  setOffline(id) {
    db.prepare("UPDATE drivers SET status = 'Offline', active_orders = 0 WHERE id = ?").run(id);
    return this.getById(id);
  },

  updatePosition(id, lat, lng) {
    db.prepare(
      "UPDATE drivers SET lat = ?, lng = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(lat, lng, id);
  },

  incrementActiveOrders(id) {
    db.prepare(
      "UPDATE drivers SET active_orders = active_orders + 1, status = 'Busy' WHERE id = ?"
    ).run(id);
  },

  decrementActiveOrders(id) {
    const driver = this.getById(id);
    if (!driver) return;
    const newCount = Math.max(0, driver.active_orders - 1);
    const newStatus = newCount === 0 ? 'Available' : 'Busy';
    db.prepare('UPDATE drivers SET active_orders = ?, status = ? WHERE id = ?')
      .run(newCount, newStatus, id);
  },

  seedDefaults() {
    const count = db.prepare('SELECT COUNT(*) as c FROM drivers').get().c;
    if (count > 0) return { seeded: false, message: 'Ya existen domiciliarios' };

    const names = ['Hans', 'Brance', 'Juan'];
    const insert = db.prepare("INSERT INTO drivers (name, status) VALUES (?, 'Offline')");
    const insertMany = db.transaction((names) => {
      for (const name of names) insert.run(name);
    });
    insertMany(names);
    return { seeded: true, message: '3 domiciliarios creados' };
  }
};

module.exports = Driver;
