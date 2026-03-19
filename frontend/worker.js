const API = '';
const BASE_LAT = 10.9059;
const BASE_LNG = -74.7862;

// Leer driver de sesión
var driver = JSON.parse(sessionStorage.getItem('fluxxi_driver') || 'null');
if (!driver) { window.location.href = 'login.html'; }

// Mostrar nombre
var ini = driver.name.split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
document.getElementById('workerInitials').textContent = ini;
document.getElementById('workerName').textContent = driver.name;

// ── Mapa ───────────────────────────────────────────────────────────────────

var wMap, wCurrentTile;
var myMarker = null;
var orderMarkers = {};
var routeLayer = null;
var myLat = null, myLng = null;

var TILE_THEMES = {
  light:     { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',     opts: { attribution: '© CARTO', maxZoom: 19, subdomains: 'abcd' } },
  dark:      { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',      opts: { attribution: '© CARTO', maxZoom: 19, subdomains: 'abcd' } },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', opts: { attribution: '© Esri', maxZoom: 19 } },
};

function setMapTheme(theme) {
  if (!wMap) return;
  if (wCurrentTile) wMap.removeLayer(wCurrentTile);
  var t = TILE_THEMES[theme] || TILE_THEMES.light;
  wCurrentTile = L.tileLayer(t.url, t.opts).addTo(wMap);
  localStorage.setItem('fluxxi_map_theme', theme);
  document.querySelectorAll('.map-theme-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

function initMap() {
  wMap = L.map('workerMap').setView([BASE_LAT, BASE_LNG], 14);
  var savedTheme = localStorage.getItem('fluxxi_map_theme') || 'light';
  setMapTheme(savedTheme);

  var baseIcon = L.divIcon({
    className: '',
    html: '<div style="background:#3b82f6;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>',
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
  L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon })
    .addTo(wMap).bindPopup('<b>Base</b><br>Cl. 49 #11-15, Soledad');

  document.querySelectorAll('.map-theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { setMapTheme(btn.dataset.theme); });
  });
}

function myIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="background:#22c55e;color:#fff;border:2px solid #fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.5);font-family:Inter,sans-serif">' + ini + '</div>',
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

function orderIcon(status) {
  var colors = { Pending: '#f59e0b', Assigned: '#3b82f6', Picked: '#a855f7', Delivered: '#22c55e', Cancelled: '#ef4444' };
  var bg = colors[status] || '#3b82f6';
  return L.divIcon({
    className: '',
    html: '<div style="background:' + bg + ';border:2px solid #fff;border-radius:4px;width:16px;height:16px;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8],
  });
}

function updateMyPosition(lat, lng) {
  myLat = lat; myLng = lng;
  if (!wMap) return;
  if (myMarker) {
    myMarker.setLatLng([lat, lng]);
  } else {
    myMarker = L.marker([lat, lng], { icon: myIcon() })
      .addTo(wMap).bindPopup('<b>' + driver.name + '</b><br>Mi posición');
    wMap.setView([lat, lng], 15);
  }
}

function updateOrdersOnMap(orders) {
  if (!wMap) return;
  var seen = {};
  orders.forEach(function(o) {
    if (!o.lat || !o.lng) return;
    seen[o.id] = true;
    var popup = '<b>' + o.order_code + '</b><br>' +
      '<b>' + o.customer_name + '</b>' +
      (o.customer_phone ? ' · <a href="tel:' + o.customer_phone + '" style="color:#3b82f6">' + o.customer_phone + '</a>' : '') +
      '<br><span style="font-size:.85em;color:#94a3b8">' + o.address + '</span>';
    if (orderMarkers[o.id]) {
      orderMarkers[o.id].setIcon(orderIcon(o.status));
      orderMarkers[o.id].getPopup().setContent(popup);
    } else {
      orderMarkers[o.id] = L.marker([o.lat, o.lng], { icon: orderIcon(o.status) })
        .addTo(wMap).bindPopup(popup);
    }
  });
  Object.keys(orderMarkers).forEach(function(id) {
    if (!seen[id]) { orderMarkers[id].remove(); delete orderMarkers[id]; }
  });
  // Dibujar ruta óptima si hay órdenes con coords y tenemos posición GPS
  drawRoute(orders.filter(function(o){ return o.lat && o.lng; }));
}

async function drawRoute(orders) {
  if (!wMap) return;
  if (routeLayer) { wMap.removeLayer(routeLayer); routeLayer = null; }
  if (!orders.length) return;

  // Punto de inicio: mi posición GPS o la base
  var startLat = myLat || BASE_LAT;
  var startLng = myLng || BASE_LNG;

  // Construir coordenadas: inicio + destinos en orden
  var coords = [[startLng, startLat]];
  orders.forEach(function(o){ coords.push([o.lng, o.lat]); });

  // OSRM API pública (gratuita, sin key)
  var coordStr = coords.map(function(c){ return c[0] + ',' + c[1]; }).join(';');
  var url = 'https://router.project-osrm.org/route/v1/driving/' + coordStr + '?overview=full&geometries=geojson';

  try {
    var res = await fetch(url);
    var data = await res.json();
    if (data.code !== 'Ok' || !data.routes.length) return;

    routeLayer = L.geoJSON(data.routes[0].geometry, {
      style: { color: '#3b82f6', weight: 4, opacity: .75, dashArray: '8,4' }
    }).addTo(wMap);
  } catch(e) {
    // OSRM no disponible — sin ruta
  }
}

// ── GPS ────────────────────────────────────────────────────────────────────

var gpsWatchId = null;

function startGPS() {
  if (!navigator.geolocation) {
    document.getElementById('gpsLabel').textContent = 'GPS no disponible';
    return;
  }
  gpsWatchId = navigator.geolocation.watchPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      document.getElementById('gpsDot').classList.add('active');
      document.getElementById('gpsLabel').textContent = 'GPS activo';
      updateMyPosition(lat, lng);
      // Enviar posición al servidor
      fetch(API + '/api/drivers/' + driver.id + '/position', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: lat, lng: lng }),
      }).catch(function(){});
    },
    function(err) {
      document.getElementById('gpsLabel').textContent = 'GPS denegado';
      document.getElementById('gpsDot').classList.remove('active');
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

// ── Render pedidos ─────────────────────────────────────────────────────────

var STATUS_LABELS = {
  Pending: 'Pendiente', Assigned: 'Asignado', Picked: 'Recogido',
  Delivered: 'Entregado', Cancelled: 'Cancelado',
};
var STATUS_BADGE = {
  Pending: 'badge-pending', Assigned: 'badge-assigned', Picked: 'badge-picked',
  Delivered: 'badge-delivered', Cancelled: 'badge-cancelled',
};

// Transiciones de estado para el trabajador
var NEXT_STATUS = {
  Assigned: { label: 'Recoger', next: 'Picked' },
  Picked:   { label: 'Entregar', next: 'Delivered' },
};

function renderOrders(orders) {
  var list = document.getElementById('myOrdersList');
  document.getElementById('myOrdersCount').textContent = orders.length;

  if (!orders.length) {
    list.innerHTML = '<div class="no-orders"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg><p>Sin pedidos asignados ahora mismo</p></div>';
    return;
  }

  list.innerHTML = orders.map(function(o) {
    var badge = STATUS_BADGE[o.status] || 'badge-pending';
    var label = STATUS_LABELS[o.status] || o.status;
    var next = NEXT_STATUS[o.status];

    var phoneHtml = o.customer_phone
      ? '<a class="order-phone" href="tel:' + o.customer_phone + '">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.06 6.06l1.18-1.18a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
          o.customer_phone + '</a>'
      : '';

    var actionBtn = next
      ? '<button class="btn btn-primary action-btn-main" onclick="advanceStatus(' + o.id + ', \'' + next.next + '\')">' + next.label + '</button>'
      : '';
    var mapBtn = (o.lat && o.lng)
      ? '<button class="btn btn-ghost action-btn-map" onclick="focusOrder(' + o.lat + ', ' + o.lng + ')">Ver en mapa</button>'
      : '';

    return '<div class="order-item">' +
      '<div class="order-item-header">' +
        '<div class="order-meta">' +
          '<div class="order-code-line">' +
            '<span class="order-code">' + o.order_code + '</span>' +
            '<span class="badge ' + badge + '">' + label + '</span>' +
          '</div>' +
          '<div class="order-customer">' + o.customer_name + '</div>' +
          (phoneHtml ? '<div style="margin-top:.3rem">' + phoneHtml + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="order-item-address">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
        o.address +
      '</div>' +
      '<div class="order-item-actions">' + actionBtn + mapBtn + '</div>' +
      '</div>';
  }).join('');
}

function focusOrder(lat, lng) {
  if (wMap) { wMap.setView([lat, lng], 16); }
}

// ── Utils ──────────────────────────────────────────────────────────────────

function toast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function(){ el.remove(); }, 3500);
}

async function advanceStatus(id, status) {
  try {
    var res = await fetch(API + '/api/orders/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status }),
    });
    var json = await res.json();
    if (!res.ok) throw new Error(json.error);
    toast(STATUS_LABELS[status] || status);
    await loadMyOrders();
  } catch(err) { toast(err.message, 'error'); }
}

async function loadMyOrders() {
  try {
    var res = await fetch(API + '/api/orders?driver_id=' + driver.id);
    var orders = await res.json();
    renderOrders(orders);
    updateOrdersOnMap(orders);
  } catch(e) { toast('Error al cargar pedidos', 'error'); }
}

// ── Logout ─────────────────────────────────────────────────────────────────

document.getElementById('btnLogout').addEventListener('click', function() {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
  // Marcar como offline al salir
  fetch(API + '/api/drivers/' + driver.id + '/offline', { method: 'PATCH' }).catch(function(){});
  sessionStorage.clear();
  window.location.href = 'login.html';
});

// ── Auto-refresh + detección de sesión cerrada ─────────────────────────────

setInterval(async function() {
  // Verificar si el admin cerró la sesión
  try {
    var res = await fetch(API + '/api/drivers/' + driver.id);
    var data = await res.json();
    if (data.status === 'Offline') {
      if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
      sessionStorage.clear();
      alert('El administrador cerró tu sesión.');
      window.location.href = 'login.html';
      return;
    }
  } catch(e) {}
  loadMyOrders();
}, 15000);

// ── Init ───────────────────────────────────────────────────────────────────

initMap();
startGPS();
loadMyOrders();
