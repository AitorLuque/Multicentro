# Repositorio Multicentro

Este repositorio contiene **dos proyectos relacionados** para la gestión de salas, materiales e infraestructura TIC en centros educativos:

| Proyecto | Carpeta | Descripción breve |
|----------|---------|-------------------|
| **GestiónCentro (Multicentro)** | [`Multicentro/`](./Multicentro/) | Plataforma original, **multi-tenant**: pensada para una red de centros (varios IES) gestionados desde una sola aplicación. |
| **CEIP Miguel Hernández** | [`MiguelHernandez/`](./MiguelHernandez/) | **Variación** del proyecto anterior, simplificada para un **único centro** (el CEIP Miguel Hernández) con branding propio. |

> MiguelHernandez **deriva** de Multicentro: comparte arquitectura, stack y la mayor parte del modelo, pero elimina la capa de centro y reduce el ámbito a las funcionalidades imprescindibles para un colegio.

---

## Stack común a ambos proyectos

- **Backend**: Node.js + Express 4, PostgreSQL (`pg`), JWT, bcrypt.
- **Frontend**: SPA en HTML + CSS + JavaScript vanilla (sin frameworks).
- **Base de datos**: PostgreSQL con extensión `pgcrypto`.

Cada proyecto es **independiente**: tiene su propio `Backend/`, `Frontend/`, su propio `database.sql` y su propio despliegue público en Render.

---

## Documentación detallada

| Documento | Contenido |
|-----------|-----------|
| [`Multicentro/DOCUMENTATION.md`](./Multicentro/DOCUMENTATION.md) | Guía técnica completa del proyecto multicentro: arquitectura, modelo de datos (13 tablas, 4 triggers, 3 vistas), backend, frontend, API REST y reglas de negocio. |
| [`MiguelHernandez/DOCUMENTATION.md`](./MiguelHernandez/DOCUMENTATION.md) | Guía técnica del proyecto monocentro, con un apartado final que detalla todas las diferencias con Multicentro. |
| [`Multicentro/README.md`](./Multicentro/README.md) | Quickstart original del proyecto. |

---

## Comparativa rápida

| Aspecto | Multicentro | MiguelHernandez |
|---------|-------------|-----------------|
| **Alcance** | Varios centros gestionados a la vez. | Un único centro (CEIP Miguel Hernández). |
| **Tablas en BD** | 13 | 8 |
| **Triggers PL/pgSQL** | 4 (solapamiento, stock, 2 historiales) | 0 — toda la lógica en backend |
| **Vistas SQL** | 3 | 0 |
| **Líneas backend** | ≈690 | ≈380 |
| **Endpoints REST** | ≈40 | ≈20 |
| **Líneas frontend** | ≈1740 (10 secciones) | ≈940 (5 secciones) |
| **Login** | Solo email | Email **o** username |
| **Roles activos** | admin, profesorado, alumnado | admin, profesorado (alumnado reservado, sin flujos) |
| **Historiales de salas/material** | Automáticos vía trigger | No existen |
| **Asistencia y asignación de puestos** | Sí | No |
| **Despliegue Render (referencia)** | `multicentro.onrender.com` | `multicentro-1.onrender.com` |

---

## Cómo arrancar cualquiera de los dos

Pasos genéricos (los específicos están en la documentación de cada proyecto):

```bash
# 1. Base de datos PostgreSQL
psql -U postgres -c "CREATE DATABASE multicentro OWNER postgres;"
psql -U postgres -d multicentro -f <proyecto>/database.sql

# 2. Backend
cd <proyecto>/Backend
npm install
# crear o ajustar .env (ver DOCUMENTATION.md del proyecto)
npm run dev

# 3. Frontend (estático)
cd ../Frontend
python3 -m http.server 8080
# Recuerda ajustar la constante API en index.html si no usas el backend público
```

---

## Estructura del repositorio

```
.
├── README.md                  # Este archivo
├── Multicentro/
│   ├── README.md
│   ├── DOCUMENTATION.md       # Documentación detallada
│   ├── database.sql
│   ├── Backend/
│   └── Frontend/
└── MiguelHernandez/
    ├── DOCUMENTATION.md       # Documentación detallada + comparativa
    ├── database.sql
    ├── Backend/
    └── Frontend/
```

---

## Licencia y autoría

Ambos proyectos son académicos y de uso interno. Si vas a publicarlos, **rota los secretos** (`JWT_SECRET`, credenciales por defecto del `.env`, contraseñas semilla) antes de desplegar a producción.
