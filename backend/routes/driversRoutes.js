const express = require('express');
const router = express.Router();
const {
  getDrivers, getDriverById, createDriver, seedDrivers,
  liberarDriver, offlineDriver, updatePosition
} = require('../controllers/driversController');

router.get('/', getDrivers);
router.post('/seed', seedDrivers);
router.post('/', createDriver);
router.get('/:id', getDriverById);
router.patch('/:id/liberar', liberarDriver);
router.patch('/:id/offline', offlineDriver);
router.patch('/:id/position', updatePosition);

module.exports = router;
