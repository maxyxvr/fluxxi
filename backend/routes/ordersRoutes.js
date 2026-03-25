const express = require('express');
const router = express.Router();
const { getOrders, createOrder, updateOrderStatus, clearTodayOrders } = require('../controllers/ordersController');

router.get('/', getOrders);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);
router.delete('/today', clearTodayOrders);

module.exports = router;
