# CEIP Miguel Hernández — Sistema de Gestión Escolar

> Variante **monocentro** y simplificada de [GestiónCentro](../Multicentro/DOCUMENTATION.md), personalizada para el **CEIP Miguel Hernández**. Mantiene la arquitectura (Node + Express + PostgreSQL + SPA vanilla) pero elimina la capa multi-tenant, reduce el modelo de datos y traslada parte de la lógica de los triggers al servidor.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Relación con el proyecto Multicentro](#2-relación-con-el-proyecto-multicentro)
3. [Arquitectura](#3-arquitectura)
4. [Estructura del proyecto](#4-estructura-del-proyecto)
5. [Modelo de datos](#5-modelo-de-datos)
6. [Lógica del backend](#6-lógica-del-backend)
7. [Frontend (SPA)](#7-frontend-spa)
8. [Roles y permisos](#8-roles-y-permisos)
9. [Instalación y despliegue](#9-instalación-y-despliegue)
10. [Referencia de la API REST](#10-referencia-de-la-api-rest)
11. [Reglas de negocio](#11-reglas-de-negocio)
12. [Datos semilla](#12-datos-semilla)
13. [Diferencias detalladas frente a Multicentro](#13-diferencias-detalladas-frente-a-multicentro)

---

## 1. Visión general

Sistema de **gestión interna** del CEIP Miguel Hernández para administrar:

- **Reserva de aulas** (cuadrante de ocupación, anti-solapamiento).
- **Inventario de material móvil** y préstamos al profesorado (con transacciones explícitas).
- **Mapa físico de las aulas informáticas** (rejilla `fila × columna` de ordenadores) con apertura de incidencias.
- **Claustro escolar** (gestión de cuentas por parte del administrador).

A diferencia de la versión multicentro, **toda la aplicación opera sobre un único centro**: el colegio. No existen los conceptos de "centro" ni "selector de centro" en ninguna capa.

### Tecnologías

Las mismas que Multicentro:

- **Backend**: Node.js + Express 4, PostgreSQL (`pg`), JWT + bcrypt.
- **Frontend**: SPA en HTML + CSS + JS vanilla, con branding propio (logo `MIGUEL_HERNANDEZ_LOGO.jpg`).

---

## 2. Relación con el proyecto Multicentro

MiguelHernandez **deriva de Multicentro** y comparte el grueso de su modelo y de sus rutas. Las diferencias se resumen en una idea: *eliminar la capa de "centro" y simplificar las funciones que no son necesarias para un único colegio*.

| Aspecto | Multicentro | MiguelHernandez |
|---------|-------------|-----------------|
| Centros | Tabla `centros`, `centro_id` propagado en plantas, salas, materiales, usuarios. | **Eliminado**. Toda la app es un único centro. |
| Nº de tablas | 13 | **8** |
| Triggers | 4 (solapamiento, stock, 2 historiales) | **0** — la lógica vive en el backend. |
| Vistas | 3 | 0 |
| Historiales | `historial_sala`, `historial_material` automáticos | No existen. |
| Asistencia a eventos (alumnado) | `asistencia_evento` | No existe. |
| Asignación de puestos por turno | `asignaciones_puesto` | No existe. |
| Login | Solo por `email` | Por **email o username** indistintamente. |
| `usuarios` | `email` UNIQUE | `username` y `email` ambos UNIQUE. |
| JWT payload | Incluye `centro_id` | No incluye `centro_id`. |
| Frontend | SPA de 10 secciones (≈1740 líneas) | SPA de 4 secciones + admin claustro (≈940 líneas), con logo y nomenclatura propia. |
| Estados de sala | `activa, inactiva` | `ok, mantenimiento, clausurado` |
| Estados de ordenador | `ok, ko, baja` | `ok, ko, reparacion` |
| Estados de préstamo | `prestado, devuelto` | `prestado, devuelto, retrasado, cancelado` |
| Anti-solapamiento | Trigger PostgreSQL | Consulta SQL previa en el handler de Express. |
| Control de stock | Trigger PostgreSQL | Transacción `BEGIN / COMMIT / ROLLBACK` en el handler. |

> Para una vista comparativa exhaustiva campo a campo, consulta el [apartado 13](#13-diferencias-detalladas-frente-a-multicentro).

---

## 3. Arquitectura

Idéntica a Multicentro en capas, más simple en contenido:

```
┌─────────────────────────────────────────────────────┐
│  PRESENTACIÓN                                       │
│  Frontend/index.html — SPA con branding del CEIP    │
│  · Login (email o username)                         │
│  · 4 vistas principales + Gestión Claustro (admin)  │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP / REST (JSON + JWT)
┌─────────────────────▼───────────────────────────────┐
│  LÓGICA DE NEGOCIO                                  │
│  Backend/server.js — Express + JWT + bcrypt         │
│  · Anti-solapamiento por consulta                   │
│  · Control de stock por transacción                 │
└─────────────────────┬───────────────────────────────┘
                      │ pg.Pool
┌─────────────────────▼───────────────────────────────┐
│  DATOS                                              │
│  PostgreSQL — 8 tablas, sin triggers, sin vistas    │
└─────────────────────────────────────────────────────┘
```

---

## 4. Estructura del proyecto

```
MiguelHernandez/
├── DOCUMENTATION.md         # Este documento
├── database.sql             # Esquema PostgreSQL (8 tablas) + seed
├── Backend/
│   ├── .env                 # Variables de entorno (¡no subir a producción!)
│   ├── package.json
│   ├── server.js            # API REST (~380 líneas)
│   └── middleware/
│       └── auth.js          # auth() y role(...)
└── Frontend/
    ├── index.html           # SPA (~940 líneas) con branding del centro
    └── MIGUEL_HERNANDEZ_LOGO.jpg
```

---

## 5. Modelo de datos

### Tablas (8)

| Tabla | Diferencias frente a Multicentro |
|-------|----------------------------------|
| `plantas` | **No tiene** `centro_id`. |
| `salas` | Estados `ok / mantenimiento / clausurado`. |
| `usuarios` | Añade **`username` UNIQUE**, deja de tener `centro_id` y `grupo`. |
| `materiales` | Sin `centro_id`. Renombrados: `cantidad_total → total_uds`, `cantidad_disponible → disponibles`. |
| `eventos` | Sin `aforo_estimado`. `tipo` con CHECK estricto (`examen, charla, tutoria, actividad, general`). |
| `prestamos_material` | Cambios de nombres: `cantidad → uds`, `fecha_salida → inicio`, `fecha_devolucion → fin_real`. Añade `fin_previsto` y estados `retrasado, cancelado`. |
| `ordenadores` | Estados `ok / ko / reparacion`. **UNIQUE** `(sala_id, fila, columna)` en lugar de `(sala_id, etiqueta)`; `fila` y `columna` son obligatorios y `> 0`. |
| `incidencias_equipo` | Estado por defecto `ko`, añade `fecha_resolucion` y `comentario_resolucion`. **No tiene** `fecha` separada — solo `created_at`. |

**No existen**: `centros`, `asistencia_evento`, `asignaciones_puesto`, `historial_sala`, `historial_material`.

### Triggers y vistas

Ninguno. Todo se gestiona desde el backend.

---

## 6. Lógica del backend

`Backend/server.js` (~380 líneas) está agrupado por dominios:

- **Autenticación** (`/api/auth/login`):
  - Acepta `email` **o** `username` en el mismo campo de entrada.
  - Normaliza la entrada con `trim().toLowerCase()`.
  - El JWT firmado contiene `{ id, nombre, email, rol }` (sin `centro_id`).

- **Gestión del claustro** (`/api/usuarios`, solo `admin`):
  - CRUD de profesores y administradores.
  - Un admin **no puede borrarse a sí mismo** (`if (req.user.id === id) → 400`).
  - Validación de unicidad de `username` y `email`.

- **Reservas (`/api/eventos`)**:
  - El anti-solapamiento se hace mediante consulta previa:
    ```sql
    SELECT * FROM eventos
    WHERE sala_id=$1 AND estado='activo'
      AND NOT (fin <= $2 OR inicio >= $3)
    ```
  - Tanto al crear como al editar; un solapamiento devuelve `400`.
  - El borrado es **físico** (`DELETE`), no cancelación lógica como en Multicentro.

- **Materiales y préstamos (`/api/materiales`, `/api/prestamos`)**:
  - El stock se controla con **transacción explícita**:
    ```js
    await q('BEGIN');
    await q('UPDATE materiales SET disponibles = disponibles - $1 …');
    await q('INSERT INTO prestamos_material …');
    await q('COMMIT');     // o ROLLBACK en catch
    ```
  - Al editar el stock total de un material, valida que `nuevo_total >= unidades_en_uso`.
  - Al eliminar un material, valida que no tenga préstamos activos.
  - Al devolver, repone el stock dentro de otra transacción.
  - Al **borrar un préstamo activo**, repone stock antes de eliminar (acción solo de admin).

- **Mapa de ordenadores y averías (`/api/ordenadores`, `/api/incidencias`)**:
  - Las posiciones están restringidas por `UNIQUE (sala_id, fila, columna)` — un duplicado devuelve `400`.
  - Al insertar una incidencia se **marca el equipo como `ko`** en la misma transacción.

### Middleware (`middleware/auth.js`)

Equivalente al de Multicentro, pero con mensajes en castellano más explícitos ("Sesión expirada o token no válido.", "Acceso denegado: Privilegios insuficientes."). No hay cambios funcionales.

---

## 7. Frontend (SPA)

`Frontend/index.html` es una SPA monolítica con:

- **Login** centrado con logo del centro y placeholder `ej: rberben` (admite usuario o email).
- **Sidebar** vertical con cuatro entradas siempre visibles más una entrada `Gestión Claustro` que solo aparece para administradores:
  - 📊 **Resumen General** (dashboard).
  - 🏫 **Reservar Aulas** (cuadrante + administración de aulas para admin).
  - 📦 **Inventario Materiales** (tabla + préstamos activos).
  - 💻 **Aulas Informáticas** (rejilla visual de PCs con estado por color).
  - 👥 **Gestión Claustro** (solo admin — CRUD de usuarios).
- **Modales** para CRUD de cada entidad.
- **Diseño responsive** con `@media (max-width: 768px)` que reordena el layout vertical en móvil/tablet.
- Constante `API = 'https://multicentro-1.onrender.com/api'` (despliegue propio en Render, distinto del de Multicentro).

> Recuerda actualizar `API` si despliegas el backend en otro lugar (o lo ejecutas en local).

---

## 8. Roles y permisos

| Rol | Permisos |
|-----|----------|
| `admin` | Acceso total: gestión del claustro, aulas, materiales, ordenadores, reservas. Único rol que ve la sección "Gestión Claustro". |
| `profesorado` | Crea y modifica sus propias reservas y préstamos; consulta inventario y mapa de equipos; puede abrir incidencias. |
| `alumnado` | Definido en el modelo (`CHECK rol IN ('admin','profesorado','alumnado')`) pero **sin flujos específicos** en la app actual: no hay vista propia ni endpoints exclusivos. |

> El rol `alumnado` queda como reserva del modelo de datos para futuras extensiones. Hoy todas las operaciones son de `admin` o `profesorado`.

---

## 9. Instalación y despliegue

### Requisitos

- Node.js ≥ 18
- PostgreSQL ≥ 13 (con extensión `pgcrypto`)

### 9.1 Base de datos

```bash
psql -U postgres -c "CREATE DATABASE multicentro OWNER postgres;"
psql -U postgres -d multicentro -f database.sql
```

> El nombre de la base de datos por defecto en el `.env` incluido es `multicentro`. Se puede usar otro renombrando la variable.

### 9.2 Backend

```bash
cd Backend
npm install
npm start          # producción
npm run dev        # desarrollo (nodemon)
```

#### Variables de entorno (`Backend/.env`)

El proyecto **incluye un `.env` de ejemplo** (no recomendado para producción):

```ini
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=multicentro
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=cambia_este_secreto_en_produccion
JWT_EXPIRES_IN=8h
```

> **Nota**: `server.js` se conecta usando `DATABASE_URL` (igual que Multicentro). Las variables `DB_*` del `.env` están a título informativo; si las usas, compón `DATABASE_URL` o adapta el código para leerlas. En producción, configura `DATABASE_URL` directamente y `NODE_ENV=production` para activar SSL.

### 9.3 Frontend

`Frontend/index.html` es estático. Servir con cualquier servidor (Live Server, `python3 -m http.server`, `npx serve`).

### 9.4 Despliegue de referencia

El backend tiene un despliegue público en **Render**: `https://multicentro-1.onrender.com/api`.

---

## 10. Referencia de la API REST

Todos los endpoints salvo `POST /api/auth/login` requieren `Authorization: Bearer <token>`.

### 10.1 Autenticación

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| POST | `/api/auth/login` | público | Acepta `{ email, password }` donde `email` puede ser email o **username**. |

### 10.2 Usuarios (claustro)

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/usuarios` | admin | Lista todo el claustro. |
| POST | `/api/usuarios` | admin | Alta con `{ username, nombre, email, password, rol }`. |
| PUT | `/api/usuarios/:id` | admin | Si se envía `password`, lo re-hashea; si no, conserva el actual. |
| DELETE | `/api/usuarios/:id` | admin | No permite auto-borrado. |

### 10.3 Dashboard

| Método | Ruta | Rol | Devuelve |
|--------|------|-----|----------|
| GET | `/api/dashboard` | auth | `{ totalSalas, salasLibres, prestamosActivos, incidenciasAbiertas, proximosEventos }` (5 próximos eventos). |

### 10.4 Salas

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/salas` | auth |
| POST | `/api/salas` | admin |
| PUT | `/api/salas/:id` | admin |
| DELETE | `/api/salas/:id` | admin |

### 10.5 Eventos (reservas)

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/eventos` | auth | Solo eventos `estado='activo'`. |
| POST | `/api/eventos` | auth | Comprueba solapamiento; el creador es `req.user.id`. |
| PUT | `/api/eventos/:id` | auth | Solo el creador o un admin; recomprueba solapamiento. |
| DELETE | `/api/eventos/:id` | auth | **Borrado físico**. Solo el creador o un admin. |

### 10.6 Materiales y préstamos

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/materiales` | auth | Solo `activo=TRUE`. |
| POST | `/api/materiales` | admin | `disponibles = total_uds` inicialmente. |
| PUT | `/api/materiales/:id` | admin | Recalcula `disponibles`; valida que no quede por debajo de las unidades en uso. |
| DELETE | `/api/materiales/:id` | admin | Solo si no hay préstamos activos. |
| GET | `/api/prestamos` | auth | Todos los préstamos con material y profesor. |
| POST | `/api/prestamos` | auth | Transacción: decrementa stock + crea préstamo. |
| POST | `/api/prestamos/:id/devolver` | auth | Transacción: marca devuelto + repone stock. |
| DELETE | `/api/prestamos/:id` | admin | Repone stock si estaba activo y elimina el registro. |

### 10.7 Ordenadores e incidencias

| Método | Ruta | Rol | Notas |
|--------|------|-----|-------|
| GET | `/api/ordenadores/sala/:salaId` | auth | Ordenados por `fila, columna`. |
| POST | `/api/ordenadores` | admin | Requiere `sala_id, etiqueta, fila, columna`. |
| PUT | `/api/ordenadores/:id` | admin | |
| DELETE | `/api/ordenadores/:id` | admin | |
| POST | `/api/incidencias` | auth | Crea incidencia y pone el ordenador en estado `ko` en la misma transacción. |

---

## 11. Reglas de negocio

| Regla | Implementación |
|-------|---------------|
| Una sala no puede tener dos reservas activas solapadas. | Consulta SQL previa en `POST /api/eventos` y `PUT /api/eventos/:id`. |
| El préstamo no puede superar el stock disponible. | Validación previa + transacción `BEGIN/COMMIT`. |
| La devolución repone el stock. | Transacción en `POST /api/prestamos/:id/devolver`. |
| Borrar un préstamo activo repone el stock. | Transacción en `DELETE /api/prestamos/:id`. |
| No puede eliminarse un material con préstamos activos. | Validación en `DELETE /api/materiales/:id`. |
| No puede reducirse `total_uds` por debajo de las unidades prestadas. | Validación en `PUT /api/materiales/:id`. |
| Solo el creador del evento o un admin pueden modificarlo o eliminarlo. | Comprobación de `req.user.rol === 'admin' || evento.profesor_id === req.user.id`. |
| Un admin no puede borrarse a sí mismo. | `if (req.user.id === id) → 400`. |
| Abrir una incidencia marca automáticamente el equipo en estado `ko`. | Transacción en `POST /api/incidencias`. |
| Un ordenador no puede ocupar dos veces la misma posición en una sala. | Constraint `UNIQUE (sala_id, fila, columna)`. |

---

## 12. Datos semilla

`database.sql` siembra el escenario inicial del CEIP Miguel Hernández:

### Usuario administrador

| Username | Nombre | Email | Contraseña | Rol |
|----------|--------|-------|------------|-----|
| `rberben` | Administrador rberben | `rberben@miguelhernandez.es` | `colegio2026` (hash bcrypt incluido) | admin |

### Plantas y aulas

- **Plantas**: Planta Baja, Primera Planta.
- **Aulas iniciales**:
  - `BIBLIO-01` — Biblioteca Central (capacidad 45).
  - `INF-LAB` — Aula Informática Principal (laboratorio, capacidad 32).
  - `SALA-MULTI` — Sala Alumnado Multiusos (capacidad 60).

### Materiales

- Carro Móvil Portátiles Chromebook (30 uds).
- Proyector Epson Ultra-Corta Distancia (×2).
- Set de iPads Educativos (×5).

> A diferencia de Multicentro, **no** se siembran eventos ni incidencias.

---

## 13. Diferencias detalladas frente a Multicentro

Esta sección resume todos los cambios técnicos entre ambos proyectos, agrupados por capa.

### 13.1 Base de datos

**Tablas eliminadas en MiguelHernandez:**
- `centros`
- `asistencia_evento`
- `asignaciones_puesto`
- `historial_sala`
- `historial_material`

**Triggers/vistas eliminados:**
- `trg_no_solapamiento` → reemplazado por consulta SQL en backend.
- `trg_stock_prestamo` → reemplazado por transacción en backend.
- `trg_historial_sala`, `trg_historial_material` → eliminados sin reemplazo.
- Las 3 vistas (`v_salas_ocupadas_ahora`, `v_prestamos_activos`, `v_incidencias_abiertas`) → eliminadas.

**Cambios de esquema:**

| Tabla | Multicentro | MiguelHernandez |
|-------|-------------|-----------------|
| `plantas` | `centro_id` FK | sin FK a centro |
| `salas` | `estado ∈ {activa,inactiva}` | `estado ∈ {ok,mantenimiento,clausurado}` |
| `usuarios` | `email` UNIQUE, `grupo`, `centro_id` | + `username` UNIQUE, − `grupo`, − `centro_id` |
| `materiales` | `centro_id`, `cantidad_total`, `cantidad_disponible` | − `centro_id`, `total_uds`, `disponibles` |
| `eventos` | + `aforo_estimado`, `tipo` libre | − `aforo_estimado`, `tipo` con CHECK enumerado |
| `prestamos_material` | `cantidad, fecha_salida, fecha_devolucion`, estado `{prestado,devuelto}` | `uds, inicio, fin_previsto, fin_real`, estado `{prestado,devuelto,retrasado,cancelado}` |
| `ordenadores` | UNIQUE `(sala_id, etiqueta)`, `fila`/`columna` opcionales, estado `{ok,ko,baja}` | UNIQUE `(sala_id, fila, columna)`, `fila`/`columna` obligatorios `> 0`, estado `{ok,ko,reparacion}` |
| `incidencias_equipo` | `fecha` propia, `estado ∈ {ok,ko}` | sin `fecha`, añade `fecha_resolucion` y `comentario_resolucion` |

### 13.2 Backend

| Aspecto | Multicentro | MiguelHernandez |
|---------|-------------|-----------------|
| Líneas | ≈690 | ≈380 |
| Endpoints | ≈40 | ≈20 |
| Login | Solo email | Email **o** username |
| JWT | `{id,nombre,email,rol,centro_id}` | `{id,nombre,email,rol}` |
| Anti-solapamiento | Trigger PostgreSQL | Consulta SQL previa |
| Stock | Trigger PostgreSQL | Transacción `BEGIN/COMMIT` |
| Cancelación de evento | Soft (`estado='cancelado'`) | Hard (DELETE) |
| Endpoints de centros/plantas/historiales/asistencia/asignaciones | Sí | **No** |
| Endpoint `/api/dashboard` | Filtra por `centro_id` del usuario | Sin filtro de centro |
| Borrado de préstamo | No existe | Sí (admin, repone stock) |
| Auto-borrado de admin | No protegido explícitamente | Bloqueado |

### 13.3 Frontend

| Aspecto | Multicentro | MiguelHernandez |
|---------|-------------|-----------------|
| Líneas | ≈1740 | ≈940 |
| Branding | Genérico "GestiónCentro" | Logo + nombre del CEIP |
| Backend por defecto | `multicentro.onrender.com` | `multicentro-1.onrender.com` |
| Secciones | 10 (Dashboard, Centros, Salas, Reservas, Inventario, Préstamos, Ordenadores, Incidencias, Historiales, Usuarios) | 5 (Dashboard, Reservas, Materiales, Ordenadores, Claustro) |
| Selector de centro | Sí, en filtros y formularios | **Eliminado** |
| Vista de incidencias | Dedicada | Integrada (modal sobre ordenador) |
| Vista de historiales | Dedicada | **No existe** |
| Layout móvil | Sidebar colapsable | Sidebar a fila superior con `@media (max-width: 768px)` |

### 13.4 Operacional

| Aspecto | Multicentro | MiguelHernandez |
|---------|-------------|-----------------|
| `.env` versionado | No (solo `.env.example`) | Sí (`Backend/.env`) — **rotar `JWT_SECRET` y credenciales antes de producción.** |
| Datos semilla | 2 centros, 7 salas, 7 usuarios, 7 materiales, 6 ordenadores, 4 eventos, 1 incidencia | 1 admin, 2 plantas, 3 aulas, 3 materiales |

---

## Referencias cruzadas

- Documentación del proyecto madre: [`../Multicentro/DOCUMENTATION.md`](../Multicentro/DOCUMENTATION.md).
- README raíz que coordina ambos: [`../README.md`](../README.md).
