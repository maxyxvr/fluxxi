const express = require('express');
const cors = require('cors');
const path = require('path');

const ordersRoutes  = require('./routes/ordersRoutes');
const driversRoutes = require('./routes/driversRoutes');
const authRoutes    = require('./routes/authRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Sirve el frontend estáticamente
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/orders',  ordersRoutes);
app.use('/api/drivers', driversRoutes);
app.use('/api/auth',    authRoutes);

// Fallback → login
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

module.exports = app;
