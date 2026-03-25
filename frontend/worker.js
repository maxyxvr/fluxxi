const API = '';
const BASE_LAT = 10.9059;
const BASE_LNG = -74.7862;

// Leer driver de sesión
var driver = JSON.parse(sessionStorage.getItem('fluxxi_driver') || 'null');
if (!driver) { window.location.href = 'login.html'; }

// Mostrar nombre
var ini = driver.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
document.getElementById('workerInitials').textContent = ini;
document.getElementById('workerName').textContent = driver.name;

// El mapa ha sido removido de la vista del domiciliario.

// ── GPS ────────────────────────────────────────────────────────────────────

var gpsWatchId = null;

function startGPS() {
  if (!navigator.geolocation) {
    document.getElementById('gpsLabel').textContent = 'GPS no disponible';
    return;
  }
  gpsWatchId = navigator.geolocation.watchPosition(
    function (pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      document.getElementById('gpsDot').classList.add('active');
      document.getElementById('gpsLabel').textContent = 'GPS activo';
      // Enviar posición al servidor
      fetch(API + '/api/drivers/' + driver.id + '/position', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: lat, lng: lng }),
      }).catch(function () { });
    },
    function (err) {
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
  Picked: { label: 'Entregar', next: 'Delivered' },
};

function renderOrders(orders) {
  var list = document.getElementById('myOrdersList');
  document.getElementById('myOrdersCount').textContent = orders.length;

  if (!orders.length) {
    list.innerHTML = '<div class="no-orders"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg><p>Sin pedidos asignados ahora mismo</p></div>';
    return;
  }

  list.innerHTML = orders.map(function (o) {
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
      '<div class="order-item-actions">' + actionBtn + '</div>' +
      '</div>';
  }).join('');
}



// ── Utils ──────────────────────────────────────────────────────────────────

function toast(msg, type) {
  type = type || 'success';
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
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
  } catch (err) { toast(err.message, 'error'); }
}

async function loadMyOrders() {
  try {
    var res = await fetch(API + '/api/orders?driver_id=' + driver.id);
    var orders = await res.json();
    renderOrders(orders);
  } catch (e) { toast('Error al cargar pedidos', 'error'); }
}

// ── Logout ─────────────────────────────────────────────────────────────────

document.getElementById('btnLogout').addEventListener('click', function () {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
  // Marcar como offline al salir
  fetch(API + '/api/drivers/' + driver.id + '/offline', { method: 'PATCH' }).catch(function () { });
  sessionStorage.clear();
  window.location.href = 'login.html';
});

// ── Auto-refresh + detección de sesión cerrada ─────────────────────────────

setInterval(async function () {
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
  } catch (e) { }
  loadMyOrders();
}, 15000);

// ── Init ───────────────────────────────────────────────────────────────────

startGPS();
loadMyOrders();
