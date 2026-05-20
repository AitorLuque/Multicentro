-- ============================================================
--  Aplicación Exclusiva: CEIP Miguel Hernández
--  Sistema de Reserva de Salas, Materiales y Mapa de Aulas
--  PostgreSQL Schema - Versión Monocentro Completa
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLA PLANTAS
CREATE TABLE plantas (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    plano      TEXT,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. TABLA SALAS (Aulas, Bibliotecas, etc.)
CREATE TABLE salas (
    id         SERIAL PRIMARY KEY,
    planta_id  INTEGER      NOT NULL REFERENCES plantas(id) ON DELETE CASCADE,
    nombre     VARCHAR(150) NOT NULL,
    codigo     VARCHAR(50)  NOT NULL UNIQUE,
    tipo       VARCHAR(50)  NOT NULL,
    capacidad  INTEGER      NOT NULL DEFAULT 0 CHECK (capacidad >= 0),
    ubicacion  TEXT,
    estado     VARCHAR(20)  NOT NULL DEFAULT 'ok'
               CHECK (estado IN ('ok','mantenimiento','clausurado')),
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- 3. TABLA USUARIOS (Admin por defecto: rberben)
CREATE TABLE usuarios (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    nombre        VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol           VARCHAR(30)  NOT NULL DEFAULT 'profesorado'
                  CHECK (rol IN ('admin','profesorado','alumnado')),
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- 4. TABLA MATERIALES
CREATE TABLE materiales (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    categoria   VARCHAR(50)  NOT NULL,
    total_uds   INTEGER      NOT NULL DEFAULT 1 CHECK (total_uds >= 0),
    disponibles INTEGER      NOT NULL DEFAULT 1 CHECK (disponibles >= 0),
    descripcion TEXT,
    activo      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 5. TABLA EVENTOS (Reservas de Espacios)
CREATE TABLE eventos (
    id          SERIAL PRIMARY KEY,
    sala_id     INTEGER      NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    profesor_id INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      VARCHAR(200) NOT NULL,
    descripcion TEXT,
    tipo        VARCHAR(50)  NOT NULL DEFAULT 'general'
                CHECK (tipo IN ('examen','charla','tutoria','actividad','general')),
    inicio      TIMESTAMPTZ  NOT NULL,
    fin         TIMESTAMPTZ  NOT NULL,
    estado      VARCHAR(20)  NOT NULL DEFAULT 'activo'
                CHECK (estado IN ('activo','cancelado')),
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT chk_fechas CHECK (fin > inicio)
);

-- 6. TABLA PRÉSTAMOS MATERIAL
CREATE TABLE prestamos_material (
    id          SERIAL PRIMARY KEY,
    material_id INTEGER      NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
    profesor_id INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    uds         INTEGER      NOT NULL DEFAULT 1 CHECK (uds > 0),
    inicio      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fin_previsto TIMESTAMPTZ NOT NULL,
    fin_real    TIMESTAMPTZ,
    estado      VARCHAR(20)  NOT NULL DEFAULT 'prestado'
                CHECK (estado IN ('prestado','devuelto','retrasado','cancelado')),
    notas       TEXT,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 7. TABLA ORDENADORES
CREATE TABLE ordenadores (
    id                 SERIAL PRIMARY KEY,
    sala_id            INTEGER     NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    etiqueta           VARCHAR(50) NOT NULL,
    cpu                VARCHAR(100),
    ram                VARCHAR(50),
    disco              VARCHAR(50),
    sistema_operativo  VARCHAR(100),
    fila               INTEGER     NOT NULL CHECK (fila > 0),
    columna            INTEGER     NOT NULL CHECK (columna > 0),
    estado             VARCHAR(20) NOT NULL DEFAULT 'ok'
                       CHECK (estado IN ('ok','ko','reparacion')),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unq_sala_pos UNIQUE (sala_id, fila, columna)
);

-- 8. TABLA INCIDENCIAS EQUIPO
CREATE TABLE incidencias_equipo (
    id           SERIAL PRIMARY KEY,
    ordenador_id INTEGER      NOT NULL REFERENCES ordenadores(id) ON DELETE CASCADE,
    profesor_id  INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    estado       VARCHAR(20)  NOT NULL DEFAULT 'ko',
    descripcion  TEXT         NOT NULL,
    resuelta     BOOLEAN      NOT NULL DEFAULT FALSE,
    fecha_resolucion TIMESTAMPTZ,
    comentario_resolucion TEXT,
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ============================================================
-- INSERCIÓN DE DATOS SEMILLA (Específicos del Centro)
-- ============================================================

-- Usuario Admin Principal solicitado: rberben (Contraseña cifrada por defecto: colegio2026)
INSERT INTO usuarios (username, nombre, email, password_hash, rol, activo)
VALUES ('rberben', 'Administrador rberben', 'rberben@miguelhernandez.es', '$2a$10$7R7z4fX9H8K2tE2M7Xg9eOa7L1rZ6bVwP3j9YmK9Z8Q7R6W5E4r3t', 'admin', true);

-- Plantas del edificio escolar
INSERT INTO plantas (nombre) VALUES ('Planta Baja'), ('Primera Planta');

-- Espacios comunes iniciales
INSERT INTO salas (planta_id, nombre, codigo, tipo, capacidad) VALUES 
(1, 'Biblioteca Central', 'BIBLIO-01', 'aula', 45),
(1, 'Aula Informática Principal', 'INF-LAB', 'laboratorio', 32),
(2, 'Sala Alumnado Multiusos', 'SALA-MULTI', 'salon', 60);

-- Inventario de recursos compartidos
INSERT INTO materiales (nombre, categoria, total_uds, disponibles, descripcion) VALUES
('Carro Móvil Portátiles Chromebook (30 uds)', 'portatiles', 1, 1, 'Armario con ventilación para equipos de alumnos'),
('Proyector Epson Ultra-Corta Distancia', 'proyectores', 2, 2, 'Conector HDMI y soporte de pared móvil'),
('Set de iPads Educativos (5 unidades)', 'lapices_digitales', 5, 5, 'Lote con aplicaciones educativas preinstaladas');