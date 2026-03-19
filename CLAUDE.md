# CLAUDE.md — Fluxxi2

## Descripción del proyecto

Sistema web para gestión de domicilios y pedidos de un pequeño negocio en Soledad, Atlántico, Colombia.

**Repositorio:** https://github.com/Enryuuh/fluxxi2.git
**Rama principal:** `main`

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express.js |
| Base de datos (dev) | SQLite via `better-sqlite3` |
| Base de datos (prod) | PostgreSQL |
| Frontend | HTML + CSS puro + JavaScript Vanilla |
| Mapas | Leaflet.js + CartoDB Dark Matter (esquemático, sin API key) |
| Rutas | OSRM API pública (gratuita, sin API key) |
| Geocodificación | Nominatim (OpenStreetMap, gratuito) |

---

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor con nodemon en :3000
npm start          # producción
```

El servidor sirve el frontend estáticamente. Abrir http://localhost:3000

---

## Arquitectura de archivos

```
fluxxi2/
├── package.json
├── CLAUDE.md
├── backend/
│   ├── server.js                  ← arranque, puerto 3000
│   ├── app.js                     ← Express, middlewares, rutas
│   ├── config/
│   │   └── database.js            ← SQLite, CREATE TABLE, migraciones ALTER TABLE
│   ├── models/
│   │   ├── Order.js               ← queries de pedidos
│   │   └── Driver.js              ← queries de domiciliarios
│   ├── controllers/
│   │   ├── ordersController.js    ← geocodifica con Nominatim al crear
│   │   ├── driversController.js   ← liberar, offline, posición GPS, GET /:id
│   │   └── authController.js      ← login admin y driver (setWaiting al login)
│   ├── routes/
│   │   ├── ordersRoutes.js
│   │   ├── driversRoutes.js
│   │   └── authRoutes.js
│   └── services/
│       └── assignmentService.js   ← asignación automática (mínimo 3 pedidos por driver)
└── frontend/
    ├── index.html                 ← redirige a login.html
    ├── login.html                 ← pantalla de acceso (2 pestañas)
    ├── waiting.html               ← sala de espera del driver (polling cada 3s)
    ├── dashboard.html             ← vista admin con mapa + panel de control
    ├── dashboard.js               ← lógica admin
    ├── worker.html                ← vista del domiciliario con mapa
    ├── worker.js                  ← lógica trabajador + GPS + rutas OSRM
    └── styles.css                 ← dark theme compartido (z-index modal: 2000)
```

---

## Base del negocio

```
Cl. 49 #11-15, Soledad, Atlántico, Colombia
Coordenadas: lat 10.9059, lng -74.7862
```

Esta ubicación es el punto de origen fijo en el mapa para todos los domiciliarios.
Las coordenadas están en `dashboard.js:2-3` y `worker.js:2-3`.

---

## Base de datos (SQLite en dev)

Archivo: `fluxxi2.db` (ignorado en git)

### Tabla `drivers`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | INTEGER PK | autoincrement |
| name | TEXT | |
| status | TEXT | `Offline` / `Waiting` / `Available` / `Busy` |
| active_orders | INTEGER | conteo de pedidos activos |
| lat | REAL | posición GPS actual |
| lng | REAL | posición GPS actual |
| last_seen | DATETIME | última actualización GPS |
| created_at | DATETIME | |

### Tabla `orders`
| Campo | Tipo | Notas |
|-------|------|-------|
| id | INTEGER PK | autoincrement |
| order_code | TEXT UNIQUE | lo introduce el operador manualmente |
| customer_name | TEXT | |
| customer_phone | TEXT | opcional |
| address | TEXT | |
| lat | REAL | geocodificado con Nominatim al crear |
| lng | REAL | geocodificado con Nominatim al crear |
| driver_id | INTEGER FK | driver asignado |
| status | TEXT | ver estados abajo |
| created_at | DATETIME | |

**Estados de pedido:** `Pending` → `Assigned` → `Picked` → `Delivered` / `Cancelled`

---

## API REST

### Auth
| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/admin` | `{ password }` | Valida clave de admin |
| POST | `/api/auth/driver` | `{ driverId }` | Login → pone driver en `Waiting` |

### Pedidos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/orders` | Todos los pedidos (join con driver_name) |
| GET | `/api/orders?driver_id=X` | Pedidos activos de un driver |
| POST | `/api/orders` | Crear pedido + geocodificar + auto-asignar |
| PATCH | `/api/orders/:id/status` | Cambiar estado |

### Domiciliarios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/drivers` | Listar todos |
| GET | `/api/drivers/:id` | Driver por ID (usado para polling de estado) |
| POST | `/api/drivers/seed` | Crear Carlos, Miguel, Andrés (si tabla vacía) |
| POST | `/api/drivers` | Crear domiciliario |
| PATCH | `/api/drivers/:id/liberar` | Cambiar status a `Available` |
| PATCH | `/api/drivers/:id/offline` | Cambiar status a `Offline` + resetear active_orders |
| PATCH | `/api/drivers/:id/position` | Actualizar lat/lng GPS |

---

## Autenticación y flujo de sesión

Sin JWT ni cookies — sesión simple en `sessionStorage` del navegador.

| Rol | Clave / Selección | Redirige a |
|-----|-------------------|-----------|
| Admin | `fluxxi2024` | `dashboard.html` |
| Empleado | Seleccionar nombre de la lista | `waiting.html` |

**Flujo de aprobación de turno:**
1. Driver selecciona su nombre → status = `Waiting` → redirige a `waiting.html`
2. `waiting.html` hace polling a `GET /api/drivers/:id` cada 3 segundos
3. Admin ve driver con badge "En espera" → clic **Iniciar turno** → status = `Available`
4. `waiting.html` detecta el cambio → redirige a `worker.html`
5. Si admin hace clic **Rechazar** → status = `Offline` → waiting muestra "sesión cerrada"

**Cierre de sesión remoto:**
- Admin puede pulsar **Cerrar sesión** en cualquier driver activo desde el dashboard
- `worker.js` detecta `status === 'Offline'` en su polling de 15s → redirige al login con alerta

---

## Mapa (Leaflet + selector de tema)

- CDN: `https://unpkg.com/leaflet@1.9.4`
- **Default**: Claro — CartoDB Positron (`light_all`)
- **Oscuro**: CartoDB Dark Matter (`dark_all`)
- **Satélite**: Esri World Imagery (sin API key)
- El tema se guarda en `localStorage` (`fluxxi_map_theme`) y se comparte entre dashboard y worker
- Marcador azul (círculo) = base del negocio
- Marcadores circulares con iniciales = domiciliarios (verde=Disponible, amarillo=Ocupado)
- Marcadores cuadrados de color = pedidos (amarillo=Pendiente, azul=Asignado, púrpura=Recogido)
- **z-index del modal**: 2000 (superior al z-index de Leaflet ~400-1000)

## Lógica de asignación de pedidos

Regla: **mínimo 3 pedidos por driver** antes de asignar a uno nuevo.

`Driver.getBestForAssignment()` en `Driver.js`:
1. Busca primero un driver con `status = 'Busy'` y `active_orders < 3` (prioriza llenarlo hasta 3)
2. Si no hay ninguno, busca el driver `Available` con menos pedidos activos

Esto garantiza que cada domiciliario lleve al menos 3 pedidos antes de que el sistema cargue a otro.

---

## Rutas en mapa del trabajador (OSRM)

- API: `https://router.project-osrm.org/route/v1/driving/` (gratuita, sin API key)
- Dibuja la ruta óptima desde la posición GPS actual del driver hasta todos sus pedidos
- Si no hay GPS usa la base como punto de inicio
- Línea azul punteada (`dashArray: '8,4'`)
- Si OSRM no responde, falla silenciosamente sin romper la UI

---

## Flujo de trabajo completo

1. Admin entra con `fluxxi2024` → dashboard
2. Admin hace clic en **Sembrar drivers** (primer arranque) o crea drivers manualmente
3. Driver entra como empleado → selecciona su nombre → pantalla de espera
4. Admin ve el driver en espera → clic **Iniciar turno**
5. Driver entra al mapa con GPS activo y lista de pedidos
6. Admin registra pedidos desde el modal → se geocodifican y asignan automáticamente
7. Driver ve la ruta trazada a sus pedidos, avanza estado: **Recoger** → **Entregar**
8. Admin puede **Cerrar sesión** de cualquier driver activo en cualquier momento
9. Al salir, el driver queda en `Offline` automáticamente

---

## Roadmap

| Fase | Estado |
|------|--------|
| Fase 1: registro, asignación, dashboard | ✅ Completo |
| Fase 2: geolocalización, mapa esquemático, rutas OSRM | ✅ Completo |
| Fase 2b: aprobación de turno y cierre de sesión remoto | ✅ Completo |
| Fase 2c: selector de tema claro/oscuro/satélite + worker móvil | ✅ Completo |
| Fase 2d: mínimo 3 pedidos por driver antes de asignar a otro | ✅ Completo |
| Fase 3: cálculo de distancia desde la base | Pendiente |
| Fase 4: cálculo automático de precio | Pendiente |
| Fase 5: índice de carga / optimización de rutas | Pendiente |

---

## Convenciones

- Commits en español: `feat: descripción`, `fix: descripción`, `refactor: descripción`
- Código del pedido lo introduce el operador (no se genera automáticamente)
- El campo `order_code` tiene constraint `UNIQUE` en la BD
- Las migraciones de columnas nuevas se hacen en `database.js` con `ALTER TABLE` condicional vía `pragma table_info`
- No usar frameworks frontend — solo HTML/CSS/JS Vanilla
- No usar `const`/`let` en archivos de frontend que no usan bundler (usar `var` para compatibilidad)
