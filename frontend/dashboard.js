const API = '';
const BASE_LAT = 10.9059;
const BASE_LNG = -74.7862;

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
    var driverCell = o.driver_name || '<span style="color:var(--text-muted)">Sin asignar</span>';
    return '<tr>' +
      '<td><span class="order-code">' + o.order_code + '</span></td>' +
      '<td><div style="font-weight:500">' + o.customer_name + '</div>' + phone + '</td>' +
      '<td class="address" style="color:var(--text-muted);font-size:.825rem">' + o.address + '</td>' +
      '<td>' + driverCell + '</td>' +
      '<td><select class="status-select" data-id="' + o.id + '">' + opts + '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + formatTime(o.created_at) + '</td>' +
      '</tr>';
  }).join('');
  tbody.querySelectorAll('.status-select').forEach(function (sel) {
    sel.addEventListener('change', function (e) { updateStatus(e.target.dataset.id, e.target.value); });
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
    _cachedOrders = orders; // guardar para reporte
  } catch (e) { toast('Error al cargar pedidos', 'error'); }
}

async function loadDrivers() {
  try {
    var res = await fetch(API + '/api/drivers');
    var drivers = await res.json();
    renderDrivers(drivers);
  } catch (e) { toast('Error al cargar domiciliarios', 'error'); }
}

async function refreshAll() { await Promise.all([loadOrders(), loadDrivers()]); }

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

// ── Google Maps Picker (modal) ─────────────────────────────────────────────

var pickerMap = null, pickerMarker = null;
var _addrLat = null, _addrLng = null;

function initPickerMap() {
  if (pickerMap) {
    google.maps.event.trigger(pickerMap, 'resize');
    return;
  }
  var center = { lat: BASE_LAT, lng: BASE_LNG };
  pickerMap = new google.maps.Map(document.getElementById('mapPickerMap'), {
    center: center, zoom: 15,
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: true,
    mapTypeId: google.maps.MapTypeId.ROADMAP,
  });

  // Marcador de la base (referencia)
  new google.maps.Marker({
    position: center, map: pickerMap,
    title: 'Base', icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7, fillColor: '#3b82f6', fillOpacity: 1,
      strokeColor: '#fff', strokeWeight: 2,
    }
  });

  // Clic en el mapa para fijar pin
  pickerMap.addListener('click', function (e) {
    setPickerPin(e.latLng.lat(), e.latLng.lng());
  });
}

function setPickerPin(lat, lng) {
  _addrLat = lat; _addrLng = lng;
  var pos = { lat: lat, lng: lng };
  if (pickerMarker) {
    pickerMarker.setPosition(pos);
  } else {
    pickerMarker = new google.maps.Marker({
      position: pos, map: pickerMap, draggable: true,
      animation: google.maps.Animation.DROP,
    });
    pickerMarker.addListener('dragend', function () {
      var p = pickerMarker.getPosition();
      _addrLat = p.lat(); _addrLng = p.lng();
      document.getElementById('addressCoordHint').style.display = 'block';
    });
  }
  document.getElementById('addressCoordHint').style.display = 'block';
}

function openPickerAt(lat, lng) {
  var wrap = document.getElementById('mapPickerWrap');
  var btn = document.getElementById('btnTogglePicker');
  wrap.style.display = 'block';
  btn.classList.add('active');
  setTimeout(function () {
    initPickerMap();
    pickerMap.setCenter({ lat: lat, lng: lng });
    pickerMap.setZoom(17);
    setPickerPin(lat, lng);
  }, 80);
}

document.getElementById('btnTogglePicker').addEventListener('click', function () {
  var wrap = document.getElementById('mapPickerWrap');
  var btn = document.getElementById('btnTogglePicker');
  var open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  btn.classList.toggle('active', !open);
  if (!open) {
    setTimeout(function () { initPickerMap(); google.maps.event.trigger(pickerMap, 'resize'); }, 80);
  }
});

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
      toast('No se encontró ubicación exacta. Marca en el mapa.', 'error');
      openPickerAt(BASE_LAT, BASE_LNG);
      return;
    }
    var lat = place.geometry.location.lat();
    var lng = place.geometry.location.lng();
    openPickerAt(lat, lng);
    toast('✓ Ubicación encontrada — ajusta el pin si es necesario');
  });

  // Soporte para coordenadas pegadas directamente (link Google Maps)
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var q = input.value.trim();
    var coordMatch = q.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (coordMatch) {
      e.preventDefault();
      var lat = parseFloat(coordMatch[1]);
      var lng = parseFloat(coordMatch[2]);
      openPickerAt(lat, lng);
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
  document.getElementById('addressCoordHint').style.display = 'none';
  document.getElementById('mapPickerWrap').style.display = 'none';
  document.getElementById('btnTogglePicker').classList.remove('active');
  if (pickerMarker) { pickerMarker.setMap(null); pickerMarker = null; }
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
    var wrap = document.getElementById('mapPickerWrap');
    var btn2 = document.getElementById('btnTogglePicker');
    wrap.style.display = 'block';
    btn2.classList.add('active');
    setTimeout(function () { initPickerMap(); }, 80);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Marca la ubicación en el mapa antes de crear el pedido', 'error');
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
  setupAddressAutocomplete();
};

refreshAll();
