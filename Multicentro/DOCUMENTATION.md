# GestiónCentro — Plataforma Multicentro Educativa

> Aplicación web para la gestión integral de **salas, eventos, material e infraestructura TIC** en uno o varios centros educativos, con control de roles, trazabilidad y validaciones de negocio.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura](#2-arquitectura)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Lógica del backend](#5-lógica-del-backend)
6. [Frontend (SPA)](#6-frontend-spa)
7. [Roles y permisos](#7-roles-y-permisos)
8. [Instalación y despliegue](#8-instalación-y-despliegue)
9. [Referencia de la API REST](#9-referencia-de-la-api-rest)
10. [Reglas de negocio garantizadas](#10-reglas-de-negocio-garantizadas)
11. [Datos semilla](#11-datos-semilla)
12. [Notas de extensibilidad](#12-notas-de-extensibilidad)

---

## 1. Visión general

**GestiónCentro** es una plataforma diseñada para institutos y centros formativos que necesitan administrar varios edificios (o varios IES de una misma red) desde una sola aplicación. Cubre cuatro grandes áreas funcionales:

| Área | Funcionalidad |
|------|---------------|
| **Espacios** | CRUD de centros, plantas y salas; consulta de ocupación en tiempo real. |
| **Reservas** | Eventos y reservas de aula con anti-solapamiento, asistencia del alumnado y cancelaciones. |
| **Materiales** | Inventario por centro, préstamos a profesorado con control automático de stock. |
| **TIC** | Mapa físico de ordenadores por sala, registro de incidencias y asignación de puestos al alumnado por turno. |

Adicionalmente provee un **dashboard agregado** por centro y **historiales** automáticos de salas y materiales.

### Tecnologías

- **Backend**: Node.js + Express 4, PostgreSQL (`pg`), JWT + bcrypt.
- **Frontend**: SPA en HTML + CSS + JavaScript vanilla (sin frameworks).
- **Base de datos**: PostgreSQL con extensión `pgcrypto`, triggers PL/pgSQL y vistas.

---

## 2. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  PRESENTACIÓN                                       │
│  Frontend/index.html  (HTML + CSS + JS vanilla)     │
│  · SPA con login → app shell                        │
│  · Sidebar con secciones filtradas por rol          │
│  · Llamadas REST con JWT en Authorization Bearer    │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP / REST (JSON)
┌─────────────────────▼───────────────────────────────┐
│  LÓGICA DE NEGOCIO                                  │
│  Backend/server.js (Express + JWT + bcrypt)         │
│  · Middleware auth() y role(...roles)               │
│  · Validaciones de negocio                          │
│  · Orquestación de queries SQL                      │
└─────────────────────┬───────────────────────────────┘
                      │ pg.Pool (pool de conexiones)
┌─────────────────────▼───────────────────────────────┐
│  DATOS                                              │
│  PostgreSQL                                         │
│  · 13 tablas + 3 vistas + 4 triggers                │
│  · Integridad referencial ON DELETE CASCADE         │
│  · Constraints de stock, fechas y unicidad          │
└─────────────────────────────────────────────────────┘
```

---

## 3. Estructura del proyecto

```
Multicentro/
├── README.md                # Guía rápida de arranque
├── DOCUMENTATION.md         # Este documento
├── database.sql             # Esquema PostgreSQL completo + seed
├── Backend/
│   ├── package.json
│   ├── server.js            # API REST (≈690 líneas, monolítico)
│   └── middleware/
│       └── auth.js          # auth() y role(...)
└── Frontend/
    └── index.html           # SPA monolítica (≈1740 líneas)
```

---

## 4. Modelo de datos

### Diagrama relacional

```
centros ──< plantas ──< salas ──< eventos ──< asistencia_evento
                          │          │
                          │          └──< historial_sala
                          │
                          └──< ordenadores ──< asignaciones_puesto
                                  │
                                  └──< incidencias_equipo

centros ──< materiales ──< prestamos_material ──< historial_material

usuarios ──< (eventos, prestamos_material, incidencias, asignaciones, asistencia, historiales)
```

### Tablas (13)

| Tabla | Propósito | Claves de interés |
|-------|-----------|-------------------|
| `centros` | Centros educativos. | `estado ∈ {activo, inactivo}` |
| `plantas` | Plantas de un centro. | FK `centro_id` ON DELETE CASCADE |
| `salas` | Aulas, laboratorios, salones, salas de reunión. | `codigo` UNIQUE, `estado ∈ {activa, inactiva}` |
| `usuarios` | Cuentas de acceso. | `rol ∈ {admin, profesorado, alumnado}`, opcionalmente vinculado a un `centro_id` |
| `eventos` | Reservas de sala (clases, exámenes, charlas…). | `tipo`, `inicio < fin`, `estado ∈ {activo, cancelado}` |
| `asistencia_evento` | Confirmación del alumnado a eventos. | UNIQUE `(evento_id, alumno_id)` |
| `materiales` | Inventario por centro. | `disponible ≤ total` (constraint) |
| `prestamos_material` | Préstamos de material a profesorado. | `estado ∈ {prestado, devuelto}` |
| `ordenadores` | Puestos físicos en salas TIC. | UNIQUE `(sala_id, etiqueta)`, posición `(fila, columna)`, `estado ∈ {ok, ko, baja}` |
| `asignaciones_puesto` | Asignación de alumnado a puesto por turno. | UNIQUE `(ordenador_id, turno)`, `turno ∈ {manana, tarde}` |
| `incidencias_equipo` | Incidencias de hardware/software. | `resuelta` BOOLEAN, `estado ∈ {ok, ko}` |
| `historial_sala` | Trazabilidad automática de reservas. | Alimentada por trigger |
| `historial_material` | Trazabilidad automática de préstamos. | Alimentada por trigger |

### Triggers (4)

| Trigger | Tabla | Acción |
|---------|-------|--------|
| `trg_no_solapamiento` | `eventos` BEFORE INSERT/UPDATE | Lanza excepción si la sala ya tiene una reserva activa que se solapa. |
| `trg_stock_prestamo` | `prestamos_material` AFTER INSERT/UPDATE | Resta stock al prestar; suma al devolver; lanza excepción si no hay stock. |
| `trg_historial_sala` | `eventos` AFTER INSERT/UPDATE | Inserta entrada `'reserva'` o `'cancelacion'` en `historial_sala`. |
| `trg_historial_material` | `prestamos_material` AFTER INSERT/UPDATE | Inserta entrada `'prestamo'` o `'devolucion'` en `historial_material`. |

### Vistas (3)

| Vista | Contenido |
|-------|-----------|
| `v_salas_ocupadas_ahora` | Salas con un evento activo cuyo intervalo contiene `NOW()`. |
| `v_prestamos_activos` | Préstamos con `estado='prestado'`, con material, profesor y centro. |
| `v_incidencias_abiertas` | Incidencias `resuelta=FALSE AND estado='ko'`, con ordenador, sala, centro. |

### Índices

Existen índices en todas las FK más usadas y en los campos de filtro (`eventos.inicio`, `prestamos.estado`, `historial_*.fecha`, etc.) — ver `database.sql`.

---

## 5. Lógica del backend

`Backend/server.js` es un único archivo Express que expone todos los endpoints. Las decisiones de diseño relevantes:

- **Pool de conexiones**: una única instancia `pg.Pool` con `connectionString = process.env.DATABASE_URL` y `ssl` activado en producción.
- **Helper de consultas**: `const q = (text, params) => pool.query(text, params).then(r => r.rows);` simplifica la sintaxis en toda la API.
- **Middleware `auth`** (`middleware/auth.js`):
  - Verifica el header `Authorization: Bearer <token>`.
  - Decodifica el JWT con `JWT_SECRET` y rellena `req.user = { id, nombre, email, rol, centro_id }`.
- **Middleware `role(...roles)`**: factoría que devuelve un middleware que comprueba `req.user.rol ∈ roles`, devolviendo `403` en caso contrario.
- **Estructura por dominios**: las rutas están agrupadas por comentarios en bloques: AUTH, CENTROS, PLANTAS, SALAS, EVENTOS, MATERIALES, PRÉSTAMOS, ORDENADORES, INCIDENCIAS, HISTORIALES, USUARIOS, DASHBOARD.
- **Filtros por query string**: la mayoría de los `GET` colectivos aceptan filtros opcionales (`centro_id`, `tipo`, `estado`, `desde`, `hasta`, `profesor`, etc.) que se incorporan dinámicamente al SQL con parámetros.
- **Errores SQL como respuesta**: cuando un trigger o constraint lanza una excepción (solapamiento, stock insuficiente, código duplicado), se devuelve `409` o `400` con `err.message`.
- **Ownership en updates/deletes**: rutas como `PUT /eventos/:id` o `PUT /prestamos/:id/devolver` aplican el patrón `(profesor_id=$X OR $Y='admin')` para que un profesor solo modifique lo suyo, mientras el admin pueda todo.

---

## 6. Frontend (SPA)

`Frontend/index.html` es una **single page application monolítica** de ~1740 líneas que combina:

- Estilos CSS embebidos (tema "navy + gold" sobre fondo crema, tipografía Playfair Display + Source Sans 3).
- Marcado HTML con dos vistas raíz: `#login-screen` y `#app` (sidebar + topbar + content).
- JavaScript vanilla con:
  - Constante `API = 'https://multicentro.onrender.com/api'` (apunta al backend desplegado en Render).
  - `localStorage` para persistir token y usuario.
  - Función central `req(path, opts)` que añade el JWT al header y maneja errores.
  - Navegación por páginas mediante `data-page` y `data-roles` (las entradas del sidebar se ocultan/muestran según el rol).
  - Páginas: **Dashboard**, **Centros y Plantas**, **Salas**, **Reservas y Eventos**, **Inventario**, **Préstamos**, **Mapa de Ordenadores**, **Incidencias**, **Historiales**, **Usuarios**.
  - Modales para CRUD (alta/edición) de cada entidad.

> **Importante**: el frontend apunta por defecto al backend desplegado en `multicentro.onrender.com`. Si se ejecuta el backend en local, editar la constante `API` al inicio del bloque `<script>` de `index.html`.

---

## 7. Roles y permisos

La aplicación define tres roles, almacenados en `usuarios.rol`:

| Rol | Permisos |
|-----|----------|
| `admin` | Acceso total: gestión de centros, plantas, salas, usuarios y material; puede modificar cualquier evento o préstamo. |
| `profesorado` | Crea y gestiona sus propias reservas; gestiona préstamos a su nombre; alta y mantenimiento de ordenadores; cambia estado OK/KO. |
| `alumnado` | Consulta; confirma o no su asistencia a eventos. |

El control de permisos se aplica **en el middleware `role(...)` de cada ruta** y, donde procede, también mediante un predicado en `WHERE` (`profesor_id = $X OR $Y='admin'`).

---

## 8. Instalación y despliegue

### Requisitos

- Node.js ≥ 18
- PostgreSQL ≥ 13 (con superusuario para crear la extensión `pgcrypto`)

### 8.1 Crear y poblar la base de datos

```bash
psql -U postgres -c "CREATE DATABASE multicentro OWNER postgres;"
psql -U postgres -d multicentro -f database.sql
```

### 8.2 Backend

```bash
cd Backend
npm install

# Crear .env (no incluido) con las variables del apartado siguiente
npm start          # producción → http://localhost:3000
npm run dev        # desarrollo con nodemon (recarga automática)
```

#### Variables de entorno (`.env`)

| Variable | Default sugerido | Descripción |
|----------|------------------|-------------|
| `PORT` | `3000` | Puerto del servidor Express. |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/multicentro` | Cadena de conexión PostgreSQL (con SSL si `NODE_ENV=production`). |
| `JWT_SECRET` | — | **Obligatorio**. Clave secreta para firmar tokens. **Cambiar en producción.** |
| `JWT_EXPIRES_IN` | `8h` | Duración del token (formato `jsonwebtoken`: `8h`, `7d`, etc.). |
| `NODE_ENV` | `development` | Si `production`, habilita SSL en la conexión a PostgreSQL (`rejectUnauthorized:false`). |

### 8.3 Frontend

`Frontend/index.html` es estático. Cualquier servidor sirve:

```bash
# Opción 1: extensión Live Server (VS Code)
# Opción 2: Python
cd Frontend && python3 -m http.server 8080
# Opción 3: npx serve
npx serve Frontend
```

> Recuerda ajustar la constante `API` dentro de `index.html` si no usas el backend de Render.

### 8.4 Despliegue de referencia

Existe un despliegue público del backend en **Render**: `https://multicentro.onrender.com/api` (referenciado por defecto en el frontend).

---

## 9. Referencia de la API REST

Todos los endpoints (salvo `POST /api/auth/login`) requieren:

```
Authorization: Bearer <token>
Content-Type: application/json
```

### 9.1 Autenticación

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| POST | `/api/auth/login` | público | Devuelve `{ token, user }` a partir de `{ email, password }`. |
| GET | `/api/auth/me` | auth | Devuelve el perfil del usuario actual. |

### 9.2 Centros y plantas

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/centros` | auth |
| GET | `/api/centros/:id` | auth |
| POST | `/api/centros` | admin |
| PUT | `/api/centros/:id` | admin |
| DELETE | `/api/centros/:id` | admin |
| GET | `/api/centros/:centroId/plantas` | auth |
| POST | `/api/centros/:centroId/plantas` | admin |
| PUT | `/api/plantas/:id` | admin |
| DELETE | `/api/plantas/:id` | admin |

### 9.3 Salas

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/salas` | auth | Filtros: `?centro_id`, `?tipo` |
| GET | `/api/salas/:id` | auth | |
| POST | `/api/salas` | admin | |
| PUT | `/api/salas/:id` | admin | |
| DELETE | `/api/salas/:id` | admin | |
| GET | `/api/salas/:id/ocupacion` | auth | Filtro opcional `?when=<ISO>`; devuelve eventos activos que cubren ese instante. |

### 9.4 Eventos / Reservas

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/eventos` | auth | Filtros: `sala_id, centro_id, tipo, desde, hasta` |
| GET | `/api/eventos/:id` | auth | |
| POST | `/api/eventos` | admin/profesorado | Disparará excepción del trigger si hay solapamiento. |
| PUT | `/api/eventos/:id` | admin/profesorado | Solo el creador o un admin. |
| DELETE | `/api/eventos/:id` | admin/profesorado | Cancela (soft delete: `estado='cancelado'`). |
| POST | `/api/eventos/:id/asistencia` | alumnado | Upsert de confirmación. |
| GET | `/api/eventos/:id/asistencia` | auth | Lista de confirmados. |

### 9.5 Materiales y préstamos

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/materiales` | auth | Filtros: `centro_id, categoria`; solo `activo=TRUE`. |
| GET | `/api/materiales/:id` | auth | |
| POST | `/api/materiales` | admin | `cantidad_disponible = cantidad_total` inicial. |
| PUT | `/api/materiales/:id` | admin | |
| GET | `/api/prestamos` | auth | Filtros: `estado, profesor_id, material_id, centro_id` |
| POST | `/api/prestamos` | admin/profesorado | Trigger valida stock. |
| PUT | `/api/prestamos/:id/devolver` | admin/profesorado | Devuelve y libera stock. |

### 9.6 Ordenadores

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/salas/:salaId/ordenadores` | auth | Devuelve mapa físico con asignaciones por turno. |
| POST | `/api/salas/:salaId/ordenadores` | admin/profesorado | |
| PUT | `/api/ordenadores/:id` | admin/profesorado | |
| DELETE | `/api/ordenadores/:id` | admin/profesorado | |
| PUT | `/api/ordenadores/:id/estado` | admin/profesorado | Cambia OK/KO/BAJA. Si `estado='ko'`, **descripción obligatoria**; abre incidencia. Si `estado='ok'`, cierra las anteriores. |
| POST | `/api/ordenadores/:id/asignaciones` | admin/profesorado | Asigna alumno por turno (upsert). |
| DELETE | `/api/ordenadores/:id/asignaciones/:turno` | admin/profesorado | Libera puesto. |

### 9.7 Incidencias e historiales

| Método | Ruta | Rol | Filtros |
|--------|------|-----|---------|
| GET | `/api/incidencias` | auth | `sala_id, centro_id, resuelta` |
| GET | `/api/historiales/salas` | auth | `sala_id, centro_id, desde, hasta, profesor` |
| GET | `/api/historiales/materiales` | auth | `material_id, centro_id, desde, hasta, profesor` |

### 9.8 Usuarios

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/usuarios` | admin | Filtros: `rol, centro_id` |
| GET | `/api/usuarios/alumnado` | admin/profesorado | Lista del centro propio (o filtrable). |
| POST | `/api/usuarios` | admin | Crea con `password` (se hashea con bcrypt cost 10). |
| PUT | `/api/usuarios/:id` | admin | |
| PUT | `/api/usuarios/:id/password` | propio usuario o admin | Mínimo 6 caracteres. |

### 9.9 Dashboard

| Método | Ruta | Rol | Devuelve |
|--------|------|-----|----------|
| GET | `/api/dashboard` | auth | `{ totalSalas, salasLibres, prestamosActivos, incidenciasAbiertas, totalMateriales, proximosEventos }` ligado al `centro_id` del usuario. |

---

## 10. Reglas de negocio garantizadas

| Regla | Implementación |
|-------|---------------|
| Una sala no puede tener dos reservas activas solapadas. | Trigger `trg_no_solapamiento` (DB). |
| El préstamo no puede superar el stock disponible. | Trigger `trg_stock_prestamo` (DB). |
| La devolución restituye el stock al material. | Trigger `trg_stock_prestamo` (DB). |
| Cancelar un evento es soft (`estado='cancelado'`), nunca se borra del histórico. | `DELETE /eventos/:id` en backend. |
| Marcar un ordenador como KO requiere descripción de incidencia. | Validación en `PUT /ordenadores/:id/estado`. |
| Marcar un ordenador como OK cierra las incidencias abiertas previas. | Backend en la misma ruta. |
| Cada reserva y préstamo deja huella en su historial. | Triggers `trg_historial_sala` y `trg_historial_material`. |
| Solo el creador del evento/préstamo o un admin pueden modificarlo. | `WHERE profesor_id=$X OR $Y='admin'` en queries de update/delete. |
| Solo `admin` puede crear centros, plantas, salas, materiales y usuarios. | Middleware `role('admin')`. |
| Solo `alumnado` puede confirmar asistencia. | Middleware `role('alumnado')` en `POST /eventos/:id/asistencia`. |
| Cada entidad funcional referencia un centro (no hay datos huérfanos). | FK obligatorias `centro_id` en `plantas`, `materiales`; y por cadena en `salas`, `eventos`, `ordenadores`. |

---

## 11. Datos semilla

`database.sql` incluye datos de ejemplo para arrancar la aplicación:

### Centros

- IES Ramón y Cajal (Madrid)
- IES Cervantes (Alcalá)

### Cuentas de prueba

| Email | Contraseña | Rol | Centro |
|-------|-----------|-----|--------|
| `admin@ies.es` | `admin123` | admin | IES Ramón y Cajal |
| `ana@ies.es` | `prof123` | profesorado | IES Ramón y Cajal |
| `luis@ies.es` | `prof123` | profesorado | IES Ramón y Cajal |
| `carlos@ies.es` | `alumno123` | alumnado | IES Ramón y Cajal |
| `maria@ies.es` | `alumno123` | alumnado | IES Ramón y Cajal |
| `admin2@ies.es` | `admin123` | admin | IES Cervantes |
| `elena@ies2.es` | `prof123` | profesorado | IES Cervantes |

Además se siembran 5 plantas, 7 salas (varios tipos), 7 materiales, 6 ordenadores (uno con incidencia), y 4 eventos futuros.

---

## 12. Notas de extensibilidad

- **Añadir un nuevo centro** no requiere cambios en código — basta con un `INSERT` en `centros` (o `POST /api/centros`).
- **Añadir nuevos tipos de sala/material** solo requiere ampliar las listas en los `<select>` del frontend; la BD no restringe el campo `tipo` ni `categoria` (son `VARCHAR` libres).
- **Modularizar el servidor**: para crecer, las rutas pueden moverse a `routes/centros.js`, `routes/salas.js`, etc., y `server.js` quedar como bootstrap.
- **Producción**: usar HTTPS detrás de un proxy inverso (nginx o el propio Render), rotar `JWT_SECRET`, y vincular `DATABASE_URL` a un PostgreSQL gestionado.
- **Pruebas**: el proyecto no incluye suite de tests; un buen punto de partida sería **supertest** sobre las rutas y **pgTAP** o `pg-mem` para los triggers.
- **Si solo necesitas un único centro**: existe la variante simplificada [`MiguelHernandez`](../MiguelHernandez/DOCUMENTATION.md), basada en este mismo proyecto pero mono-centro.
