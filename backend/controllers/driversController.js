const Driver = require('../models/Driver');

function getDrivers(req, res) {
  try {
    const drivers = Driver.getAll();
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function getDriverById(req, res) {
  try {
    const driver = Driver.getById(req.params.id);
    if (!driver) return res.status(404).json({ error: 'No encontrado' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function createDriver(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });
  try {
    const driver = Driver.create({ name });
    res.status(201).json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function seedDrivers(req, res) {
  try {
    const result = Driver.seedDefaults();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function liberarDriver(req, res) {
  try {
    const driver = Driver.liberar(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Domiciliario no encontrado' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function offlineDriver(req, res) {
  try {
    const driver = Driver.setOffline(req.params.id);
    if (!driver) return res.status(404).json({ error: 'Domiciliario no encontrado' });
    res.json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function updatePosition(req, res) {
  const { lat, lng } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: 'lat y lng requeridos' });
  try {
    Driver.updatePosition(req.params.id, lat, lng);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getDrivers, getDriverById, createDriver, seedDrivers, liberarDriver, offlineDriver, updatePosition };
