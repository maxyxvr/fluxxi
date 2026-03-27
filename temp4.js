const API = '';
const BASE_LAT = 10.9059;
const BASE_LNG = -74.7862;

let map, currentTileLayer;
const driverMarkers = {};
const orderMarkers = {};

const TILE_THEMES = {
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', opts: { attribution: '?? CARTO', maxZoom: 19, subdomains: 'abcd' } },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', opts: { attribution: '?? CARTO', maxZoom: 19, subdomains: 'abcd' } },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { attribution: '?? Esri', maxZoom: 19 } },
};

function setMapTheme(theme) {
  if (!map) return;
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  const t = TILE_THEMES[theme] || TILE_THEMES.light;
  currentTileLayer = L.tileLayer(t.url, t.opts).addTo(map);
  localStorage.setItem('fluxxi_map_theme', theme);
  document.querySelectorAll('.map-theme-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

function initMap() {
  map = L.map('map').setView([BASE_LAT, BASE_LNG], 14);
  const savedTheme = localStorage.getItem('fluxxi_map_theme') || 'light';
  setMapTheme(savedTheme);

  const baseIcon = L.divIcon({
    className: '',
    html: '<div style="background:#3b82f6;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
  L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon })
    .addTo(map).bindPopup('<b>Base</b><br>Cl. 49 #11-15, Soledad');

  document.querySelectorAll('.map-theme-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setMapTheme(btn.dataset.theme); });
  });
}

function driverIcon(name, status) {
  const colors = { Available: '#22c55e', Busy: '#f59e0b', Offline: '#64748b' };
  const bg = colors[status] || '#64748b';
  const ini = name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  return L.divIcon({
    className: '',
    html: '<div style="background:' + bg + ';color:#fff;border:2px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4);font-family:Inter,sans-serif">' + ini + '</div>',
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

function orderIcon(status) {
  const colors = { Pending: '#f59e0b', Assigned: '#3b82f6', Picked: '#a855f7', Delivered: '#22c55e', Cancelled: '#ef4444' };
  const bg = colors[status] || '#f59e0b';
  return L.divIcon({
    className: '',
    html: '<div style="background:' + bg + ';border:2px solid #fff;border-radius:4px;width:14px;height:14px;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
}

function updateMapDrivers(drivers) {
  if (!map) return;
  var seen = {};
  drivers.forEach(function (d) {
    if (d.status === 'Offline' || !d.lat || !d.lng) return;
    seen[d.id] = true;
    if (driverMarkers[d.id]) {
      driverMarkers[d.id].setLatLng([d.lat, d.lng]).setIcon(driverIcon(d.name, d.status));
    } else {
      driverMarkers[d.id] = L.marker([d.lat, d.lng], { icon: driverIcon(d.name, d.status) })
        .addTo(map).bindPopup('<b>' + d.name + '</b>');
    }
    driverMarkers[d.id].getPopup().setContent(
      '<b>' + d.name + '</b><br>' + (DRIVER_STATUS_LABEL[d.status] || d.status) + '<br>' + d.active_orders + ' pedido(s) activo(s)'
    );
  });
  Object.keys(driverMarkers).forEach(function (id) {
    if (!seen[id]) { driverMarkers[id].remove(); delete driverMarkers[id]; }
  });
}

function updateMapOrders(orders) {
  if (!map) return;
  var seen = {};
  orders.forEach(function (o) {
    if (!o.lat || !o.lng || o.status === 'Delivered' || o.status === 'Cancelled') return;
    seen[o.id] = true;
    if (orderMarkers[o.id]) {
      orderMarkers[o.id].setIcon(orderIcon(o.status));
    } else {
      orderMarkers[o.id] = L.marker([o.lat, o.lng], { icon: orderIcon(o.status) })
        .addTo(map).bindPopup('<b>' + o.order_code + '</b><br>' + o.customer_name + '<br>' + o.address);
    }
  });
  Object.keys(orderMarkers).forEach(function (id) {
    if (!seen[id]) { orderMarkers[id].remove(); delete orderMarkers[id]; }
  });
}

// ?????? Utils ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

function toast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}

function formatTime(iso) {
  if (!iso) return '???';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

var STATUS_LABELS = {
  Pending: 'Pendiente', Assigned: 'Asignado', Picked: 'Recogido',
  Delivered: 'Entregado', Cancelled: 'Cancelado',
};
var DRIVER_BADGE = { Available: 'badge-available', Busy: 'badge-busy', Offline: 'badge-offline', Waiting: 'badge-pending' };
var DRIVER_DOT = { Available: 'dot-green', Busy: 'dot-yellow', Offline: 'dot-red', Waiting: 'dot-yellow' };
var DRIVER_STATUS_LABEL = { Available: 'Disponible', Busy: 'Ocupado', Offline: 'Offline', Waiting: 'En espera' };

// ?????? Render Orders ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

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
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No hay pedidos todav\u00eda</p></div></td></tr>';
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

// ?????? Render Drivers ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

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
      actionBtn = '<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:var(--red)" onclick="cerrarSesionDriver(' + d.id + ')">Cerrar sesi??n</button>';
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

// ?????? API calls ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

async function loadOrders() {
  try {
    var res = await fetch(API + '/api/orders');
    var orders = await res.json();
    renderOrders(orders);
    updateMapOrders(orders);
  } catch (e) { toast('Error al cargar pedidos', 'error'); }
}

async function loadDrivers() {
  try {
    var res = await fetch(API + '/api/drivers');
    var drivers = await res.json();
    renderDrivers(drivers);
    updateMapDrivers(drivers);
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
    toast('Estado ??? ' + (STATUS_LABELS[status] || status));
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
    toast(json.name + ' ??? turno iniciado');
    await loadDrivers();
  } catch (err) { toast(err.message, 'error'); }
}

async function cerrarSesionDriver(id) {
  try {
    var res = await fetch(API + '/api/drivers/' + id + '/offline', { method: 'PATCH' });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(json.name + ' ??? sesi??n cerrada');
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

// ?????? Modal ??????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

var modal = document.getElementById('orderModal');
var form = document.getElementById('orderForm');

// Coordenadas confirmadas por el autocompletado
var _addrLat = null, _addrLng = null, _addrTimer = null;

// Expande abreviaturas y extrae calle + ciudad de direcci??n colombiana
// "Cl. 50 # 8A-21, Soledad, Atl??ntico" ??? { street: "Calle 50", city: "Soledad" }
function parseColAddress(raw) {
  var s = raw
    .replace(/\bCra?\.?\s*/gi, 'Carrera ')
    .replace(/\bCl\.?\s*/gi, 'Calle ')
    .replace(/\bDg\.?\s*/gi, 'Diagonal ')
    .replace(/\bTv\.?\s*|Transv\.?\s*/gi, 'Transversal ')
    .replace(/\bAv\.?\s*/gi, 'Avenida ')
    .replace(/\bNo\.?\s*/gi, '#');

  // Base: solo lo que est?? antes del #
  var streetBase = s.split(/[#,]/)[0].replace(/\s{2,}/g, ' ').trim();
  streetBase = streetBase.replace(/\s+\d+[a-zA-Z]?\s*-\s*\d+.*$/, '').trim();

  // Cruce exacto (ej. "Calle 50 8A")
  // 1. Quitar la ciudad y todo desde la primera coma 
  var noCity = s.split(',')[0];
  // 2. Extraer todo ANTES del gui??n (o de la placa)
  // "Calle 50 # 8A - 21" -> "Calle 50 # 8A"
  var crossMatch = noCity.match(/^(.*?)(?:\s*-\s*\d+.*)?$/);
  var streetCross = crossMatch ? crossMatch[1] : noCity;
  // Limpiar el s??mbolo de # para que Nominatim no se asuste
  streetCross = streetCross.replace(/#/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Ciudad: primera parte despu??s de la primera coma
  var afterComma = raw.split(',');
  var city = afterComma.length > 1 ? afterComma[1].trim() : 'Soledad';
  // Quitar "Atl??ntico", "Colombia", etc. que no son ciudad
  city = city.replace(/atl[a??]ntico|colombia/gi, '').trim() || 'Soledad';

  return { streetBase: streetBase, streetCross: streetCross, city: city };
}

// B??squeda estructurada: Nominatim entiende mejor street + city separados
function nominatimStructured(street, city) {
  var url = 'https://nominatim.openstreetmap.org/search?' +
    'street=' + encodeURIComponent(street) +
    '&city=' + encodeURIComponent(city) +
    '&state=Atl%C3%A1ntico&country=Colombia' +
    '&format=json&limit=5&addressdetails=1';
  return fetch(url, { headers: { 'Accept-Language': 'es' } }).then(function (r) { return r.json(); });
}

// B??squeda libre como fallback
function nominatimFree(q) {
  var url = 'https://nominatim.openstreetmap.org/search?q=' +
    encodeURIComponent(q + ', Atl??ntico, Colombia') +
    '&format=json&limit=5&countrycodes=co&addressdetails=1' +
    '&viewbox=-74.95,11.12,-74.68,10.82';
  return fetch(url, { headers: { 'Accept-Language': 'es' } }).then(function (r) { return r.json(); });
}

function setupAddressAutocomplete() {
  var input = document.getElementById('fieldAddress');
  var hint = document.getElementById('addressCoordHint');

  // Ocultar sugerencias si exist??an
  var box = document.getElementById('addressSuggestions');
  if (box) box.style.display = 'none';

  input.addEventListener('keydown', async function (e) {
    if (e.key === 'Enter') {
      e.preventDefault(); // Evitar env??o del formulario

      var q = input.value.trim();
      if (q.length < 5) {
        toast('Ingresa una direcci??n m??s detallada para validar', 'error');
        return;
      }

      var oldText = input.value;
      input.disabled = true;

      // 0. Superpoder: ??Es un link de Google Maps o coordenadas crudas?
      // Match a "10.985, -74.812" o link de gmaps ".../@10.985,-74.812,17z"
      var coordMatch = q.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
      if (coordMatch && !isNaN(parseFloat(coordMatch[1])) && !isNaN(parseFloat(coordMatch[2]))) {
        var lat = parseFloat(coordMatch[1]);
        var lng = parseFloat(coordMatch[2]);
        input.disabled = false;
        openPickerAt(lat, lng);
        toast('??? Coordenadas exactas importadas');
        return;
      }

      try {
        var parsed = parseColAddress(q);

        // Intento 1: Alta precisi??n con cruce exacto en texto libre (ej. "Calle 50 8A, Soledad")
        var data = await nominatimFree(parsed.streetCross + ', ' + parsed.city);

        // Intento 2: B??squeda estructurada del cruce
        if (!data.length) data = await nominatimStructured(parsed.streetCross, parsed.city);

        // Intento 3: Fallback a la calle base libre (ej. "Calle 50, Soledad")
        if (!data.length) data = await nominatimFree(parsed.streetBase + ', ' + parsed.city);

        // Intento 4: Fallback removiendo lo que quede de n??meros extras (emergencia extrema)
        if (!data.length) {
          var streetClean = parsed.streetBase.replace(/\s+\d.*$/, '');
          if (streetClean.length > 5) data = await nominatimFree(streetClean + ', ' + parsed.city);
        }

        if (data && data.length > 0) {
          var lat = parseFloat(data[0].lat);
          var lng = parseFloat(data[0].lon);
          openPickerAt(lat, lng);
          toast('Verifica la ubicaci??n en el mapa');
        } else {
          toast('No se encontr?? exacto. Mueve el pin manualmente.', 'error');
          openPickerAt(BASE_LAT, BASE_LNG);
        }
      } catch (err) {
        toast('Error buscando la ubicaci??n', 'error');
      } finally {
        input.disabled = false;
        input.focus();
      }
    }
  });
}

// ?????? Mapa picker (dentro del modal) ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

var pickerMap = null, pickerMarker = null;

// Abre el picker centrado en lat/lng y pone el pin ah??
function openPickerAt(lat, lng) {
  var wrap = document.getElementById('mapPickerWrap');
  var btn = document.getElementById('btnTogglePicker');
  wrap.style.display = 'block';
  btn.classList.add('active');
  setTimeout(function () {
    initPickerMap();
    pickerMap.invalidateSize();
    pickerMap.setView([lat, lng], 17);
    setPickerPin(lat, lng);
  }, 80);
}

function initPickerMap() {
  if (pickerMap) { setTimeout(function () { pickerMap.invalidateSize(); }, 50); return; }
  pickerMap = L.map('mapPickerMap', { zoomControl: true }).setView([BASE_LAT, BASE_LNG], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { attribution: '?? CARTO', maxZoom: 19, subdomains: 'abcd' }).addTo(pickerMap);

  // Marcador de la base (referencia)
  var baseIcon = L.divIcon({
    className: '',
    html: '<div style="background:#3b82f6;border:2px solid #fff;border-radius:50%;width:12px;height:12px"></div>',
    iconSize: [12, 12], iconAnchor: [6, 6],
  });
  L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon }).addTo(pickerMap)
    .bindTooltip('Base', { permanent: false });

  pickerMap.on('click', function (e) { setPickerPin(e.latlng.lat, e.latlng.lng); });
}

function setPickerPin(lat, lng) {
  _addrLat = lat; _addrLng = lng;
  var hint = document.getElementById('addressCoordHint');
  if (pickerMarker) {
    pickerMarker.setLatLng([lat, lng]);
  } else {
    pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);
    pickerMarker.on('dragend', function () {
      var p = pickerMarker.getLatLng();
      _addrLat = p.lat; _addrLng = p.lng;
      hint.style.display = 'block';
    });
  }
  hint.style.display = 'block';
}

document.getElementById('btnTogglePicker').addEventListener('click', function () {
  var wrap = document.getElementById('mapPickerWrap');
  var btn = document.getElementById('btnTogglePicker');
  var open = wrap.style.display === 'block';
  wrap.style.display = open ? 'none' : 'block';
  btn.classList.toggle('active', !open);
  if (!open) {
    setTimeout(function () {
      initPickerMap();
      pickerMap.invalidateSize();
    }, 80);
  }
});

function openModal() { modal.classList.add('open'); document.getElementById('fieldCode').focus(); }
function closeModal() {
  modal.classList.remove('open'); form.reset();
  _addrLat = null; _addrLng = null;
  document.getElementById('addressSuggestions').style.display = 'none';
  document.getElementById('addressCoordHint').style.display = 'none';
  document.getElementById('mapPickerWrap').style.display = 'none';
  document.getElementById('btnTogglePicker').classList.remove('active');
  // Reset pin del picker
  if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
  var b = document.getElementById('submitBtn');
  b.disabled = false; b.textContent = 'Crear pedido';
}

document.getElementById('btnNewOrder').addEventListener('click', openModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);
modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

form.addEventListener('submit', async function (e) {
  e.preventDefault();

  // Requiere ubicaci??n confirmada en el mapa
  if (!_addrLat || !_addrLng) {
    // Abrir el mapa picker autom??ticamente
    var wrap = document.getElementById('mapPickerWrap');
    var btn2 = document.getElementById('btnTogglePicker');
    wrap.style.display = 'block';
    btn2.classList.add('active');
    setTimeout(function () {
      initPickerMap();
      pickerMap.invalidateSize();
    }, 80);
    document.getElementById('btnTogglePicker').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast('Marca la ubicaci??n en el mapa antes de crear el pedido', 'error');
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
    toast('Pedido ' + order.order_code + ' creado' + (order.driver_name ? ' ??? ' + order.driver_name : ''));
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

// ?????? Auto-refresh ?????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

var countdown = 15;
setInterval(async function () {
  countdown--;
  document.getElementById('countdown').textContent = countdown;
  if (countdown <= 0) { countdown = 15; await refreshAll(); }
}, 1000);

// ?????? Init ?????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????

initMap();
setupAddressAutocomplete();
refreshAll();
