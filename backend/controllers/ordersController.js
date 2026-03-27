const Order = require('../models/Order');
const Driver = require('../models/Driver');
const { assignDriver, releaseDriver } = require('../services/assignmentService');
const https = require('https');

const VALID_STATUSES = ['Pending', 'Assigned', 'Picked', 'Delivered', 'Cancelled'];

// Expande abreviaturas comunes colombianas para mejorar geocodificación
function normalizeAddress(address) {
  return address
    .replace(/\bCl\.?\s*/gi, 'Calle ')
    .replace(/\bCr\.?\s*|Cra\.?\s*|Carrera\.?\s*/gi, 'Carrera ')
    .replace(/\bDg\.?\s*/gi, 'Diagonal ')
    .replace(/\bTv\.?\s*|Transv\.?\s*/gi, 'Transversal ')
    .replace(/\bAv\.?\s*/gi, 'Avenida ')
    .replace(/\bNo\.?\s*/gi, '#')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function geocode(address) {
  return new Promise(async (resolve) => {
    // 0. Superpoder: ¿Es un link de Google Maps o coordenadas crudas?
    const coordMatch = address.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (coordMatch && !isNaN(parseFloat(coordMatch[1])) && !isNaN(parseFloat(coordMatch[2]))) {
      return resolve({ lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) });
    }

    const normalized = normalizeAddress(address);
    // Base: solo la calle maestra (e.g. "Calle 50")
    let streetBase = normalized.split(/[#,]/)[0].trim();
    streetBase = streetBase.replace(/\s+\d+[a-zA-Z]?\s*-\s*\d+.*$/, '').trim();

    // Cruce exacto: "Calle 50 8A" (removiendo el  "- 21" o la placa)
    let noCity = normalized.split(',')[0];
    let crossMatch = noCity.match(/^(.*?)(?:\s*-\s*\d+.*)?$/);
    let streetCross = crossMatch ? crossMatch[1] : noCity;
    streetCross = streetCross.replace(/#/g, ' ').replace(/\s{2,}/g, ' ').trim();

    const parts = address.split(',');
    let city = parts.length > 1 ? parts[1].trim() : 'Soledad';
    city = city.replace(/atl[aá]ntico|colombia/gi, '').trim() || 'Soledad';

    // Función auxiliar para HTTP simplificado
    const fetchOSM = (queryUrl) => new Promise(r => {
      const REQ = https.get(queryUrl, { headers: { 'User-Agent': 'fluxxi2/1.0', 'Accept-Language': 'es' } }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { r(JSON.parse(d)); } catch { r([]); } });
      });
      REQ.on('error', () => r([]));
      REQ.setTimeout(4000, () => { REQ.destroy(); r([]); });
    });

    try {
      // Intento 1: Alta precisión con cruce (ej. "Calle 50 8A, Soledad") libre o estructurada
      let q1 = encodeURIComponent(`${streetCross}, ${city}, Atlántico, Colombia`);
      let data = await fetchOSM(`https://nominatim.openstreetmap.org/search?q=${q1}&format=json&limit=1&countrycodes=co&viewbox=-74.85,10.85,-74.72,10.97&bounded=1`);

      // Intento 2: Cruce completo en toda el area metropolitana
      if (!data || !data.length) {
        let q2 = encodeURIComponent(`${streetCross}, ${city}, Atlántico, Colombia`);
        data = await fetchOSM(`https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=1&countrycodes=co`);
      }

      // Intento 3: Base simple sin cruce (ej. "Calle 50, Soledad")
      if (!data || !data.length) {
        let q3 = encodeURIComponent(`${streetBase}, ${city}, Atlántico, Colombia`);
        data = await fetchOSM(`https://nominatim.openstreetmap.org/search?q=${q3}&format=json&limit=1&countrycodes=co`);
      }

      // Resultado final
      if (data && data.length > 0) {
        return resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      }
      resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function getOrders(req, res) {
  try {
    const { driver_id } = req.query;
    const orders = driver_id ? Order.getByDriver(driver_id) : Order.getAll();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createOrder(req, res) {
  const { order_code, customer_name, customer_phone, address, lat, lng } = req.body;

  if (!order_code || !customer_name || !address) {
    return res.status(400).json({ error: 'Campos requeridos: order_code, customer_name, address' });
  }

  try {
    // Si el frontend ya envió coordenadas confirmadas, usarlas directamente
    let coords = (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : await geocode(address);
    const order = Order.create({
      order_code, customer_name, customer_phone, address,
      lat: coords ? coords.lat : null,
      lng: coords ? coords.lng : null,
    });
    // Sin auto-asignación: el admin elige el domiciliario manualmente
    const updated = Order.getById(order.id);
    res.status(201).json({ ...updated, driver_name: null });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `El código de pedido '${order_code}' ya existe` });
    }
    res.status(500).json({ error: err.message });
  }
}

function updateOrderStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Estado inválido. Válidos: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const order = Order.getById(id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    if ((status === 'Delivered' || status === 'Cancelled') && order.status !== status) {
      releaseDriver(order.id);
    }

    const updated = Order.updateStatus(id, status);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function clearTodayOrders(req, res) {
  try {
    const result = Order.deleteToday();
    res.json({ ok: true, deleted: result.deleted, message: `${result.deleted} pedido(s) del día eliminados` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function assignDriverManual(req, res) {
  const { id } = req.params;
  const { driver_id } = req.body;

  if (!driver_id) return res.status(400).json({ error: 'driver_id es requerido' });

  try {
    const order = Order.getById(id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    const driver = Driver.getById(driver_id);
    if (!driver) return res.status(404).json({ error: 'Driver no encontrado' });

    // Si el pedido ya tenía otro driver, liberar conteo del anterior
    if (order.driver_id && order.driver_id !== driver_id) {
      releaseDriver(order.id);
    }

    // Asignar el nuevo driver
    const updated = Order.assignDriver(id, driver_id);

    // Incrementar active_orders del driver seleccionado
    Driver.incrementActiveOrders(driver_id);

    res.json({ ...updated, driver_name: driver.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getOrders, createOrder, updateOrderStatus, clearTodayOrders, assignDriverManual };

