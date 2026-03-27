const express = require('express');
const router = express.Router();
const { getOrders, createOrder, updateOrderStatus, clearTodayOrders, assignDriverManual } = require('../controllers/ordersController');

router.get('/', getOrders);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);
router.patch('/:id/driver', assignDriverManual);
router.delete('/today', clearTodayOrders);

module.exports = router;
