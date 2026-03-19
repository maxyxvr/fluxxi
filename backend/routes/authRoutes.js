const express = require('express');
const router = express.Router();
const { loginAdmin, loginDriver } = require('../controllers/authController');

router.post('/admin', loginAdmin);
router.post('/driver', loginDriver);

module.exports = router;
