const API = '';
const BASE_LAT = 10.9059;
const BASE_LNG = -74.7862;

var mainMap = null;
var driverMarkers = {};
var orderMarkers = {};

// ── Utils ──────────────────────────────────────────────────────────────────

function toast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

var STATUS_LABELS = {
  Pending: 'Pendiente', Assigned: 'Asignado', Picked: 'Recogido',
  Delivered: 'Entregado', Cancelled: 'Cancelado',
};
var DRIVER_BADGE = { Available: 'badge-available', Busy: 'badge-busy', Offline: 'badge-offline', Waiting: 'badge-pending' };
var DRIVER_DOT = { Available: 'dot-green', Busy: 'dot-yellow', Offline: 'dot-red', Waiting: 'dot-yellow' };
var DRIVER_STATUS_LABEL = { Available: 'Disponible', Busy: 'Ocupado', Offline: 'Offline', Waiting: 'En espera' };

// ── Render Orders ──────────────────────────────────────────────────────────

function buildDriverSelect(orderId, currentDriverId, currentDriverName) {
  // Solo mostrar opciones con drivers que están Available o Busy (activos)
  var activeDrivers = _cachedDrivers.filter(function(d) {
    return d.status === 'Available' || d.status === 'Busy';
  });

  if (!currentDriverId && activeDrivers.length === 0) {
    return '<span style="color:var(--text-muted)">Sin asignar</span>';
  }

  var options = '<option value="">Sin asignar</option>';
  activeDrivers.forEach(function(d) {
    options += '<option value="' + d.id + '"' + (d.id == currentDriverId ? ' selected' : '') + '>' + d.name + '</option>';
  });
  // Si hay un driver asignado que está offline, igual mostrarlo como opción
  if (currentDriverId && !activeDrivers.find(function(d) { return d.id == currentDriverId; })) {
    options += '<option value="' + currentDriverId + '" selected>' + (currentDriverName || 'Driver #' + currentDriverId) + '</option>';
  }

  return '<select class="status-select driver-assign-select" data-order-id="' + orderId + '">' + options + '</select>';
}

function renderOrders(orders) {
  var tbody = document.getElementById('ordersBody');
  document.getElementById('ordersCount').textContent = orders.length;
  var counts = { Pending: 0, Assigned: 0, Picked: 0, Delivered: 0, Cancelled: 0 };
  orders.forEach(function (o) { if (counts[o.status] !== undefined) counts[o.status]++; });
  document.getElementById('statTotal').textContent = orders.length;
  document.getElementById('statPending').textContent = counts.Pending;
  document.getElementById('statActive').textContent = counts.Assigned + counts.Picked;
  document.getElementById('statDelivered').textContent = counts.Delivered;
  document.getElementById('statCancelled').textContent = counts.Cancelled;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No hay pedidos todavía</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(function (o) {
    var opts = Object.keys(STATUS_LABELS).map(function (s) {
      return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + STATUS_LABELS[s] + '</option>';
    }).join('');
    var phone = o.customer_phone ? '<div style="font-size:.75rem;color:var(--text-muted)">' + o.customer_phone + '</div>' : '';
    var driverCell = buildDriverSelect(o.id, o.driver_id, o.driver_name);
    return '<tr>' +
      '<td><span class="order-code">' + o.order_code + '</span></td>' +
      '<td><div style="font-weight:500">' + o.customer_name + '</div>' + phone + '</td>' +
      '<td class="address" style="color:var(--text-muted);font-size:.825rem">' + o.address + '</td>' +
      '<td>' + driverCell + '</td>' +
      '<td><select class="status-select" data-id="' + o.id + '">' + opts + '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + formatTime(o.created_at) + '</td>' +
      '</tr>';
  }).join('');
  tbody.querySelectorAll('.status-select:not(.driver-assign-select)').forEach(function (sel) {
    sel.addEventListener('change', function (e) { updateStatus(e.target.dataset.id, e.target.value); });
  });
  tbody.querySelectorAll('.driver-assign-select').forEach(function (sel) {
    sel.addEventListener('change', function (e) {
      var orderId = e.target.dataset.orderId;
      var driverId = e.target.value;
      assignDriverToOrder(orderId, driverId);
    });
  });
}

// ── Render Drivers ─────────────────────────────────────────────────────────

function renderDrivers(drivers) {
  var list = document.getElementById('driversList');
  document.getElementById('driversCount').textContent = drivers.length;
  if (!drivers.length) {
    list.innerHTML = '<div class="empty-state"><p>Sin domiciliarios. Usa <strong>Sembrar drivers</strong>.</p></div>';
    return;
  }
  list.innerHTML = drivers.map(function (d) {
    var bc = DRIVER_BADGE[d.status] || 'badge-offline';
    var dc = DRIVER_DOT[d.status] || 'dot-red';
    var lbl = DRIVER_STATUS_LABEL[d.status] || d.status;
    var ini = d.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var actionBtn;
    if (d.status === 'Offline') {
      actionBtn = '';
    } else if (d.status === 'Waiting') {
      actionBtn = '<button class="btn btn-primary btn-sm" onclick="liberarDriver(' + d.id + ')">Iniciar turno</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="offlineDriver(' + d.id + ')">Rechazar</button>';
    } else {
      actionBtn = '<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:var(--red)" onclick="cerrarSesionDriver(' + d.id + ')">Cerrar sesión</button>';
    }
    return '<div class="driver-card">' +
      '<div class="driver-info">' +
      '<div class="driver-avatar">' + ini + '</div>' +
      '<div>' +
      '<div class="driver-name">' + d.name + '</div>' +
      '<div class="driver-orders">' + d.active_orders + ' pedido' + (d.active_orders !== 1 ? 's' : '') + ' activo' + (d.active_orders !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      '</div>' +
      '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">' +
      '<span class="badge ' + bc + '"><span class="dot ' + dc + '"></span>' + lbl + '</span>' +
      actionBtn +
      '</div>' +
      '</div>';
  }).join('');
}

// ── API calls ──────────────────────────────────────────────────────────────

async function loadOrders() {
  try {
    var res = await fetch(API + '/api/orders');
    var orders = await res.json();
    renderOrders(orders);
    if (typeof updateMapOrders === 'function') updateMapOrders(orders);
    _cachedOrders = orders; // guardar para reporte
  } catch (e) { toast('Error al cargar pedidos', 'error'); }
}

async function loadDrivers() {
  try {
    var res = await fetch(API + '/api/drivers');
    var drivers = await res.json();
    _cachedDrivers = drivers; // guardar para dropdown de asignación
    renderDrivers(drivers);
    if (typeof updateMapDrivers === 'function') updateMapDrivers(drivers);
  } catch (e) { toast('Error al cargar domiciliarios', 'error'); }
}

async function refreshAll() {
  await loadDrivers();  // primero drivers → llena _cachedDrivers
  await loadOrders();   // luego pedidos → buildDriverSelect ya tiene la lista
}

async function createOrder(data) {
  var res = await fetch(API + '/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  var json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al crear pedido');
  return json;
}

async function updateStatus(id, status) {
  try {
    var res = await fetch(API + '/api/orders/' + id + '/status', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }),
    });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast('Estado → ' + (STATUS_LABELS[status] || status));
    await refreshAll();
  } catch (err) { toast(err.message, 'error'); await loadOrders(); }
}

async function seedDrivers() {
  try {
    var res = await fetch(API + '/api/drivers/seed', { method: 'POST' });
    var json = await res.json();
    toast(json.message || 'Listo');
    await loadDrivers();
  } catch (e) { toast('Error al sembrar drivers', 'error'); }
}

async function assignDriverToOrder(orderId, driverId) {
  try {
    if (!driverId) {
      toast('Selecciona un domiciliario válido', 'error');
      await refreshAll(); // revertir el select
      return;
    }
    var res = await fetch(API + '/api/orders/' + orderId + '/driver', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: parseInt(driverId) }),
    });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast('✓ Asignado a ' + json.driver_name);
    await refreshAll();
  } catch (err) { toast(err.message, 'error'); await refreshAll(); }
}

async function liberarDriver(id) {
  try {
    var res = await fetch(API + '/api/drivers/' + id + '/liberar', { method: 'PATCH' });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(json.name + ' — turno iniciado');
    await loadDrivers();
  } catch (err) { toast(err.message, 'error'); }
}

async function cerrarSesionDriver(id) {
  try {
    var res = await fetch(API + '/api/drivers/' + id + '/offline', { method: 'PATCH' });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(json.name + ' — sesión cerrada');
    await loadDrivers();
  } catch (err) { toast(err.message, 'error'); }
}

async function offlineDriver(id) {
  try {
    var res = await fetch(API + '/api/drivers/' + id + '/offline', { method: 'PATCH' });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(json.name + ' pausado');
    await loadDrivers();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Reporte del día ────────────────────────────────────────────────────────

var _cachedOrders = [];
var _cachedDrivers = [];  // lista de drivers activos para el dropdown

function downloadDailyReport() {
  var today = new Date().toLocaleDateString('es-CO');
  var rows = [['Código', 'Cliente', 'Teléfono', 'Dirección', 'Domiciliario', 'Estado', 'Hora']];
  var todayStr = new Date().toISOString().slice(0, 10);
  var todayOrders = _cachedOrders.filter(function (o) {
    return o.created_at && o.created_at.slice(0, 10) === todayStr;
  });
  if (!todayOrders.length) { toast('No hay pedidos del día para exportar', 'error'); return; }
  todayOrders.forEach(function (o) {
    rows.push([
      o.order_code,
      o.customer_name,
      o.customer_phone || '',
      '"' + (o.address || '').replace(/"/g, '""') + '"',
      o.driver_name || 'Sin asignar',
      STATUS_LABELS[o.status] || o.status,
      formatTime(o.created_at),
    ]);
  });
  var csv = rows.map(function (r) { return r.join(','); }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = 'reporte_' + todayStr + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast('Reporte descargado (' + todayOrders.length + ' pedidos)');
}

async function clearTodayOrders() {
  if (!confirm('¿Eliminar todos los pedidos de hoy? Esta acción no se puede deshacer.')) return;
  try {
    var res = await fetch(API + '/api/orders/today', { method: 'DELETE' });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(json.message);
    await refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Google Maps Principal ──────────────────────────────────────────────────

function initMainMap() {
  mainMap = new google.maps.Map(document.getElementById('mainMap'), {
    center: { lat: BASE_LAT, lng: BASE_LNG },
    zoom: 14,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  new google.maps.Marker({
    position: { lat: BASE_LAT, lng: BASE_LNG }, map: mainMap,
    title: 'Base', icon: {
      path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
    }
  });
}

function updateMapDrivers(drivers) {
  if (!mainMap) return;
  var seen = {};
  var colors = { Available: '#22c55e', Busy: '#f59e0b', Waiting: '#f59e0b', Offline: '#64748b' };
  drivers.forEach(function (d) {
    if (d.status === 'Offline' || !d.lat || !d.lng) return;
    seen[d.id] = true;
    var pos = { lat: d.lat, lng: d.lng };
    if (driverMarkers[d.id]) {
      driverMarkers[d.id].setPosition(pos);
      driverMarkers[d.id].getIcon().fillColor = colors[d.status] || '#64748b';
    } else {
      driverMarkers[d.id] = new google.maps.Marker({
        position: pos, map: mainMap, title: d.name,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: colors[d.status] || '#64748b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        label: { text: d.name.charAt(0).toUpperCase(), color: '#fff', fontSize: '11px', fontWeight: 'bold' }
      });
    }
  });
  Object.keys(driverMarkers).forEach(function (id) {
    if (!seen[id]) { driverMarkers[id].setMap(null); delete driverMarkers[id]; }
  });
}

function updateMapOrders(orders) {
  if (!mainMap) return;
  var seen = {};
  var colors = { Pending: '#f59e0b', Assigned: '#3b82f6', Picked: '#a855f7' };
  orders.forEach(function (o) {
    if (!o.lat || !o.lng || o.status === 'Delivered' || o.status === 'Cancelled') return;
    seen[o.id] = true;
    var pos = { lat: o.lat, lng: o.lng };
    if (orderMarkers[o.id]) {
      orderMarkers[o.id].setPosition(pos);
      orderMarkers[o.id].getIcon().fillColor = colors[o.status] || '#f59e0b';
    } else {
      orderMarkers[o.id] = new google.maps.Marker({
        position: pos, map: mainMap, title: o.order_code,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: colors[o.status] || '#f59e0b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
      });
    }
  });
  Object.keys(orderMarkers).forEach(function (id) {
    if (!seen[id]) { orderMarkers[id].setMap(null); delete orderMarkers[id]; }
  });
}

// ── Google Maps Picker (modal) ─────────────────────────────────────────────

var pickerMap = null, pickerMarker = null;
var _addrLat = null, _addrLng = null;


// ── Google Places Autocomplete ─────────────────────────────────────────────

function setupAddressAutocomplete() {
  // Esperar a que Google Maps esté listo
  if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
    setTimeout(setupAddressAutocomplete, 300);
    return;
  }

  var input = document.getElementById('fieldAddress');
  var autocomplete = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: 'co' },
    fields: ['geometry', 'formatted_address', 'name'],
    types: ['address'],
  });

  // Bias hacia Soledad/Barranquilla Atlántico
  var bounds = new google.maps.LatLngBounds(
    { lat: 10.75, lng: -74.95 },
    { lat: 11.10, lng: -74.65 }
  );
  autocomplete.setBounds(bounds);

  autocomplete.addListener('place_changed', function () {
    var place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
      toast('No se encontró ubicación exacta. Por favor escribe de nuevo o sé más específico.', 'error');
      return;
    }
    _addrLat = place.geometry.location.lat();
    _addrLng = place.geometry.location.lng();
    toast('✓ Ubicación confirmada');
  });

  // Soporte para coordenadas pegadas directamente (link Google Maps)
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var q = input.value.trim();
    var coordMatch = q.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (coordMatch) {
      e.preventDefault();
      _addrLat = parseFloat(coordMatch[1]);
      _addrLng = parseFloat(coordMatch[2]);
      toast('✓ Coordenadas importadas');
    }
  });
}

// ── Modal ──────────────────────────────────────────────────────────────────

var modal = document.getElementById('orderModal');
var form = document.getElementById('orderForm');

function openModal() { modal.classList.add('open'); document.getElementById('fieldCode').focus(); }
function closeModal() {
  modal.classList.remove('open'); form.reset();
  _addrLat = null; _addrLng = null;
  var b = document.getElementById('submitBtn');
  b.disabled = false; b.textContent = 'Crear pedido';
}

document.getElementById('btnNewOrder').addEventListener('click', openModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  if (!_addrLat || !_addrLng) {
    toast('Por favor, selecciona una dirección válida del autocompletado antes de crear el pedido', 'error');
    return;
  }

  var btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Creando...';
  try {
    var order = await createOrder({
      order_code: document.getElementById('fieldCode').value.trim(),
      customer_name: document.getElementById('fieldName').value.trim(),
      customer_phone: document.getElementById('fieldPhone').value.trim(),
      address: document.getElementById('fieldAddress').value.trim(),
      lat: _addrLat,
      lng: _addrLng,
    });
    toast('Pedido ' + order.order_code + ' creado' + (order.driver_name ? ' → ' + order.driver_name : ''));
    closeModal(); await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = 'Crear pedido';
  }
});

document.getElementById('btnSeed').addEventListener('click', seedDrivers);
document.getElementById('btnLogout').addEventListener('click', function () {
  sessionStorage.clear(); window.location.href = 'login.html';
});
document.getElementById('btnDownloadReport').addEventListener('click', downloadDailyReport);
document.getElementById('btnClearToday').addEventListener('click', clearTodayOrders);

// ── Polling en vivo cada 5 s ───────────────────────────────────────────────

setInterval(refreshAll, 5000);

// ── Init ───────────────────────────────────────────────────────────────────

// Inicializar autocomplete cuando Google Maps cargue
window.initGoogleMapsCallback = function () {
  initMainMap();
  setupAddressAutocomplete();
  refreshAll(); // Cargar la primera vez y poner los pines en el mapa
};

// No llamamos a refreshAll() directamente aquí afuera; la llamamos cuando Google Maps está listo (arriba) y cada 5s

