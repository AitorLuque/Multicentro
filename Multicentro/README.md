# GestiónCentro — Plataforma multicentro educativa

Aplicación web para la gestión de salas, material e incidencias TIC en centros educativos.

## Estructura del proyecto

```
/
├── database.sql          # Script de creación de BD (PostgreSQL)
├── backend/
│   ├── server.js         # API REST (Node.js + Express)
│   ├── package.json
│   ├── .env.example
│   └── middleware/
│       └── auth.js       # JWT + control de roles
└── frontend/
    └── index.html        # SPA (HTML + CSS + JS vanilla)
```

---

## 1. Base de datos

```bash
# Crear base de datos
psql -U postgres -c "CREATE DATABASE multicentro OWNER postgres;"

# Ejecutar el script
psql -U postgres -d multicentro -f database.sql
```

### Credenciales de prueba (seed)

| Usuario | Email | Contraseña | Rol |
|---------|-------|------------|-----|
| Administrador | admin@ies.es | admin123 | admin |
| Prof. Ana García | ana@ies.es | prof123 | profesorado |
| Prof. Luis Martín | luis@ies.es | prof123 | profesorado |
| Carlos Pérez | carlos@ies.es | alumno123 | alumnado |

---

## 2. Backend

```bash
cd backend

# Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env si es necesario (host, puerto, secreto JWT, etc.)

# Instalar dependencias
npm install

# Iniciar servidor
npm start          # producción → http://localhost:3000
npm run dev        # desarrollo con nodemon
```

### Variables de entorno (`.env`)

| Variable | Default | Descripción |
|----------|---------|-------------|
| PORT | 3000 | Puerto del servidor |
| DB_HOST | localhost | Host PostgreSQL |
| DB_PORT | 5432 | Puerto PostgreSQL |
| DB_NAME | multicentro | Nombre de la BD |
| DB_USER | postgres | Usuario PostgreSQL |
| DB_PASSWORD | postgres | Contraseña PostgreSQL |
| JWT_SECRET | — | **Cambia este valor en producción** |
| JWT_EXPIRES_IN | 8h | Duración del token |

---

## 3. Frontend

Abre `frontend/index.html` directamente en el navegador, o sírvelo con cualquier servidor estático:

```bash
# Opción 1: extensión Live Server (VS Code)
# Opción 2: Python
cd frontend && python3 -m http.server 8080
# Opción 3: npm serve
npx serve frontend
```

> **Importante**: el frontend apunta a `http://localhost:3000/api`.  
> Si cambias el puerto del backend, edita la constante `API` al inicio de `index.html`.

---

## 4. API REST — Referencia rápida

Todos los endpoints (salvo `/api/auth/login`) requieren el header:

```
Authorization: Bearer <token>
```

### Autenticación
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login → devuelve token + user |
| GET  | /api/auth/me    | Datos del usuario actual |

### Centros y estructura
| Método | Ruta | Rol mínimo |
|--------|------|------------|
| GET  | /api/centros | todos |
| POST | /api/centros | admin |
| PUT  | /api/centros/:id | admin |
| DELETE | /api/centros/:id | admin |
| GET  | /api/centros/:id/plantas | todos |
| POST | /api/centros/:id/plantas | admin |

### Salas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | /api/salas?centro_id=&tipo= | Listado con filtros |
| GET  | /api/salas/:id/ocupacion?when= | Quién ocupa la sala ahora |
| POST | /api/salas | admin |
| PUT  | /api/salas/:id | admin |

### Eventos / Reservas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | /api/eventos?sala_id=&tipo=&desde=&hasta= | Listado |
| POST | /api/eventos | profesorado/admin |
| DELETE | /api/eventos/:id | Cancela (soft) |
| POST | /api/eventos/:id/asistencia | alumnado (confirmar) |

### Materiales y préstamos
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | /api/materiales?centro_id=&categoria= | Inventario |
| POST | /api/materiales | admin |
| GET  | /api/prestamos?estado= | Préstamos |
| POST | /api/prestamos | profesorado/admin |
| PUT  | /api/prestamos/:id/devolver | Registrar devolución |

### Ordenadores
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | /api/salas/:id/ordenadores | Mapa de sala |
| POST | /api/salas/:id/ordenadores | Añadir PC |
| PUT  | /api/ordenadores/:id/estado | Marcar OK/KO |
| POST | /api/ordenadores/:id/asignaciones | Asignar alumno |

### Historiales
| Método | Ruta | Filtros disponibles |
|--------|------|---------------------|
| GET | /api/historiales/salas | centro_id, profesor, desde, hasta |
| GET | /api/historiales/materiales | centro_id, profesor, desde, hasta |
| GET | /api/incidencias | resuelta, centro_id |

---

## 5. Arquitectura

```
┌─────────────────────────────────────────────────────┐
│  PRESENTACIÓN                                       │
│  frontend/index.html  (HTML + CSS + JS vanilla)     │
│  SPA con autenticación JWT, rutas por estado        │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP / REST (JSON)
┌─────────────────────▼───────────────────────────────┐
│  LÓGICA DE NEGOCIO                                  │
│  backend/server.js (Express + JWT + bcrypt)         │
│  · Control de roles por middleware                  │
│  · Validaciones de negocio (solapamientos, stock)   │
│  · Trazabilidad automática (triggers BD)            │
└─────────────────────┬───────────────────────────────┘
                      │ pg (Pool de conexiones)
┌─────────────────────▼───────────────────────────────┐
│  DATOS                                              │
│  PostgreSQL                                         │
│  · 13 tablas + 3 vistas + 4 triggers                │
│  · Integridad referencial con ON DELETE CASCADE     │
│  · Constraints de solapamiento y stock              │
└─────────────────────────────────────────────────────┘
```

---

## 6. Criterios de evaluación cubiertos

| Criterio | Implementación |
|----------|---------------|
| Modelo de datos | 13 tablas con PK/FK, constraints, triggers |
| API REST | Express con rutas organizadas, control de errores |
| Control de permisos | Middleware JWT + role('admin','profesorado'…) |
| Frontend usable | SPA responsive, dashboard, CRUD completo |
| Trazabilidad | Historiales filtrados para salas y materiales |
| Multicentro | Cada entidad referencia `centro_id`, sin código hardcoded |
| No solapamientos | Trigger `trg_no_solapamiento` en tabla eventos |
| Control de stock | Trigger `trg_stock_prestamo` en préstamos |
| Historial automático | Triggers de historial en eventos y préstamos |
| KO obliga incidencia | Validado en backend `/ordenadores/:id/estado` |

---

## Notas de desarrollo

- El proyecto es extensible: añadir nuevos centros no requiere cambios de código.
- Para producción: cambiar `JWT_SECRET`, usar HTTPS y un proxy inverso (nginx).
- Para ampliar la API se pueden extraer las rutas a ficheros separados (`routes/*.js`).
