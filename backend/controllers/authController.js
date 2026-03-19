const Driver = require('../models/Driver');

const ADMIN_PASSWORD = 'fluxxi2024';

function loginAdmin(req, res) {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, role: 'admin' });
  } else {
    res.status(401).json({ error: 'Clave incorrecta' });
  }
}

function loginDriver(req, res) {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ error: 'driverId requerido' });

  try {
    const driver = Driver.getById(driverId);
    if (!driver) return res.status(404).json({ error: 'Domiciliario no encontrado' });
    // Marcar como en espera de aprobacion del admin
    Driver.setWaiting(driverId);
    const updated = Driver.getById(driverId);
    res.json({ ok: true, role: 'driver', driver: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { loginAdmin, loginDriver };
