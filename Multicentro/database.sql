-- ============================================================
--  Aplicación Multicentro: Reserva de Salas, Materiales
--  y Mapa de Ordenadores
--  PostgreSQL Schema
--  Usuario: postgres | Contraseña: postgres
-- ============================================================

-- 1. Crear base de datos (ejecutar como superusuario si procede):
--    CREATE DATABASE multicentro OWNER postgres;
--    \c multicentro

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLAS
-- ============================================================

CREATE TABLE centros (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(150) NOT NULL,
    direccion  TEXT,
    estado     VARCHAR(20)  NOT NULL DEFAULT 'activo'
               CHECK (estado IN ('activo','inactivo')),
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE plantas (
    id         SERIAL PRIMARY KEY,
    centro_id  INTEGER      NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
    nombre     VARCHAR(100) NOT NULL,
    plano      TEXT,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE salas (
    id         SERIAL PRIMARY KEY,
    planta_id  INTEGER      NOT NULL REFERENCES plantas(id) ON DELETE CASCADE,
    nombre     VARCHAR(150) NOT NULL,
    codigo     VARCHAR(50)  NOT NULL UNIQUE,
    tipo       VARCHAR(50)  NOT NULL,
    capacidad  INTEGER      NOT NULL DEFAULT 0 CHECK (capacidad >= 0),
    ubicacion  TEXT,
    estado     VARCHAR(20)  NOT NULL DEFAULT 'activa'
               CHECK (estado IN ('activa','inactiva')),
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE usuarios (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    email         VARCHAR(200) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    rol           VARCHAR(20)  NOT NULL CHECK (rol IN ('admin','profesorado','alumnado')),
    grupo         VARCHAR(50),
    centro_id     INTEGER      REFERENCES centros(id) ON DELETE SET NULL,
    activo        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE eventos (
    id             SERIAL PRIMARY KEY,
    sala_id        INTEGER      NOT NULL REFERENCES salas(id)    ON DELETE CASCADE,
    profesor_id    INTEGER      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo         VARCHAR(200) NOT NULL,
    descripcion    TEXT,
    tipo           VARCHAR(50)  NOT NULL DEFAULT 'general',
    inicio         TIMESTAMPTZ  NOT NULL,
    fin            TIMESTAMPTZ  NOT NULL,
    aforo_estimado INTEGER      DEFAULT 0,
    estado         VARCHAR(20)  NOT NULL DEFAULT 'activo'
                   CHECK (estado IN ('activo','cancelado')),
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT evento_fechas_validas CHECK (inicio < fin)
);

CREATE TABLE asistencia_evento (
    id         SERIAL PRIMARY KEY,
    evento_id  INTEGER     NOT NULL REFERENCES eventos(id)  ON DELETE CASCADE,
    alumno_id  INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    confirmado BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (evento_id, alumno_id)
);

CREATE TABLE materiales (
    id                  SERIAL PRIMARY KEY,
    centro_id           INTEGER      NOT NULL REFERENCES centros(id) ON DELETE CASCADE,
    nombre              VARCHAR(150) NOT NULL,
    categoria           VARCHAR(100) NOT NULL,
    cantidad_total      INTEGER      NOT NULL DEFAULT 0 CHECK (cantidad_total >= 0),
    cantidad_disponible INTEGER      NOT NULL DEFAULT 0 CHECK (cantidad_disponible >= 0),
    descripcion         TEXT,
    activo              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT disponible_lte_total CHECK (cantidad_disponible <= cantidad_total)
);

CREATE TABLE prestamos_material (
    id               SERIAL PRIMARY KEY,
    material_id      INTEGER     NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
    profesor_id      INTEGER     NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
    cantidad         INTEGER     NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    fecha_salida     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_devolucion TIMESTAMPTZ,
    estado           VARCHAR(20) NOT NULL DEFAULT 'prestado'
                     CHECK (estado IN ('prestado','devuelto')),
    observaciones    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ordenadores (
    id                SERIAL PRIMARY KEY,
    sala_id           INTEGER     NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    etiqueta          VARCHAR(50) NOT NULL,
    cpu               VARCHAR(150),
    ram               VARCHAR(50),
    disco             VARCHAR(50),
    sistema_operativo VARCHAR(100),
    fila              INTEGER,
    columna           INTEGER,
    observaciones     TEXT,
    estado            VARCHAR(10) NOT NULL DEFAULT 'ok'
                      CHECK (estado IN ('ok','ko','baja')),
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sala_id, etiqueta)
);

CREATE TABLE asignaciones_puesto (
    id           SERIAL PRIMARY KEY,
    ordenador_id INTEGER     NOT NULL REFERENCES ordenadores(id) ON DELETE CASCADE,
    alumno_id    INTEGER     NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
    turno        VARCHAR(20) NOT NULL CHECK (turno IN ('manana','tarde')),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ordenador_id, turno)
);

CREATE TABLE incidencias_equipo (
    id           SERIAL PRIMARY KEY,
    ordenador_id INTEGER     NOT NULL REFERENCES ordenadores(id) ON DELETE CASCADE,
    profesor_id  INTEGER     NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
    estado       VARCHAR(10) NOT NULL CHECK (estado IN ('ko','ok')),
    descripcion  TEXT,
    resuelta     BOOLEAN     NOT NULL DEFAULT FALSE,
    fecha        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE historial_sala (
    id         SERIAL PRIMARY KEY,
    sala_id    INTEGER     NOT NULL REFERENCES salas(id)    ON DELETE CASCADE,
    usuario_id INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    accion     VARCHAR(50) NOT NULL,
    detalle    TEXT,
    fecha      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE historial_material (
    id          SERIAL PRIMARY KEY,
    material_id INTEGER     NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
    usuario_id  INTEGER     NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
    accion      VARCHAR(50) NOT NULL,
    cantidad    INTEGER,
    detalle     TEXT,
    fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_plantas_centro        ON plantas(centro_id);
CREATE INDEX idx_salas_planta          ON salas(planta_id);
CREATE INDEX idx_eventos_sala          ON eventos(sala_id);
CREATE INDEX idx_eventos_profesor      ON eventos(profesor_id);
CREATE INDEX idx_eventos_inicio        ON eventos(inicio);
CREATE INDEX idx_asistencia_evento     ON asistencia_evento(evento_id);
CREATE INDEX idx_materiales_centro     ON materiales(centro_id);
CREATE INDEX idx_prestamos_material    ON prestamos_material(material_id);
CREATE INDEX idx_prestamos_profesor    ON prestamos_material(profesor_id);
CREATE INDEX idx_prestamos_estado      ON prestamos_material(estado);
CREATE INDEX idx_ordenadores_sala      ON ordenadores(sala_id);
CREATE INDEX idx_asignaciones_ord      ON asignaciones_puesto(ordenador_id);
CREATE INDEX idx_incidencias_ord       ON incidencias_equipo(ordenador_id);
CREATE INDEX idx_historial_sala_fecha  ON historial_sala(fecha);
CREATE INDEX idx_historial_mat_fecha   ON historial_material(fecha);

-- ============================================================
-- TRIGGER: Evitar solapamientos de reserva en la misma sala
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_solapamiento()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM eventos
        WHERE sala_id = NEW.sala_id
          AND estado  = 'activo'
          AND id     != COALESCE(NEW.id, -1)
          AND (NEW.inicio, NEW.fin) OVERLAPS (inicio, fin)
    ) THEN
        RAISE EXCEPTION 'Conflicto: la sala ya tiene una reserva en ese intervalo.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_solapamiento
BEFORE INSERT OR UPDATE ON eventos
FOR EACH ROW EXECUTE FUNCTION fn_check_solapamiento();

-- ============================================================
-- TRIGGER: Gestionar stock al crear préstamo o devolución
-- ============================================================
CREATE OR REPLACE FUNCTION fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF (SELECT cantidad_disponible FROM materiales WHERE id = NEW.material_id) < NEW.cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para realizar el préstamo.';
        END IF;
        UPDATE materiales
           SET cantidad_disponible = cantidad_disponible - NEW.cantidad
         WHERE id = NEW.material_id;
    ELSIF TG_OP = 'UPDATE'
      AND NEW.estado = 'devuelto' AND OLD.estado = 'prestado' THEN
        UPDATE materiales
           SET cantidad_disponible = cantidad_disponible + NEW.cantidad
         WHERE id = NEW.material_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_prestamo
AFTER INSERT OR UPDATE ON prestamos_material
FOR EACH ROW EXECUTE FUNCTION fn_actualizar_stock();

-- ============================================================
-- TRIGGER: Historial automático de salas
-- ============================================================
CREATE OR REPLACE FUNCTION fn_historial_sala()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_sala(sala_id, usuario_id, accion, detalle)
        VALUES (NEW.sala_id, NEW.profesor_id, 'reserva',
                'Evento: ' || NEW.titulo || ' | ' || to_char(NEW.inicio,'DD/MM/YYYY HH24:MI')
                || ' → ' || to_char(NEW.fin,'DD/MM/YYYY HH24:MI'));
    ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'cancelado' AND OLD.estado = 'activo' THEN
        INSERT INTO historial_sala(sala_id, usuario_id, accion, detalle)
        VALUES (NEW.sala_id, NEW.profesor_id, 'cancelacion', 'Cancelado: ' || NEW.titulo);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historial_sala
AFTER INSERT OR UPDATE ON eventos
FOR EACH ROW EXECUTE FUNCTION fn_historial_sala();

-- ============================================================
-- TRIGGER: Historial automático de materiales
-- ============================================================
CREATE OR REPLACE FUNCTION fn_historial_material()
RETURNS TRIGGER AS $$
DECLARE v_nombre TEXT;
BEGIN
    SELECT nombre INTO v_nombre FROM materiales WHERE id = NEW.material_id;
    IF TG_OP = 'INSERT' THEN
        INSERT INTO historial_material(material_id, usuario_id, accion, cantidad, detalle)
        VALUES (NEW.material_id, NEW.profesor_id, 'prestamo', NEW.cantidad,
                'Préstamo: ' || v_nombre || ' (x' || NEW.cantidad || ')');
    ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'devuelto' AND OLD.estado = 'prestado' THEN
        INSERT INTO historial_material(material_id, usuario_id, accion, cantidad, detalle)
        VALUES (NEW.material_id, NEW.profesor_id, 'devolucion', NEW.cantidad,
                'Devolución: ' || v_nombre || ' (x' || NEW.cantidad || ')');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_historial_material
AFTER INSERT OR UPDATE ON prestamos_material
FOR EACH ROW EXECUTE FUNCTION fn_historial_material();

-- ============================================================
-- VISTAS
-- ============================================================
CREATE OR REPLACE VIEW v_salas_ocupadas_ahora AS
SELECT s.id AS sala_id, s.nombre AS sala, s.codigo, p.nombre AS planta,
       c.nombre AS centro, e.titulo, e.tipo, u.nombre AS profesor,
       e.inicio, e.fin
FROM eventos e
JOIN salas s ON s.id = e.sala_id
JOIN plantas p ON p.id = s.planta_id
JOIN centros c ON c.id = p.centro_id
JOIN usuarios u ON u.id = e.profesor_id
WHERE e.estado = 'activo' AND NOW() BETWEEN e.inicio AND e.fin;

CREATE OR REPLACE VIEW v_prestamos_activos AS
SELECT pm.id, m.nombre AS material, m.categoria, u.nombre AS profesor,
       pm.cantidad, pm.fecha_salida, c.nombre AS centro
FROM prestamos_material pm
JOIN materiales m ON m.id = pm.material_id
JOIN usuarios u ON u.id = pm.profesor_id
JOIN centros c ON c.id = m.centro_id
WHERE pm.estado = 'prestado';

CREATE OR REPLACE VIEW v_incidencias_abiertas AS
SELECT ie.id, o.etiqueta AS ordenador, s.nombre AS sala, c.nombre AS centro,
       ie.descripcion, u.nombre AS profesor, ie.fecha
FROM incidencias_equipo ie
JOIN ordenadores o ON o.id = ie.ordenador_id
JOIN salas s ON s.id = o.sala_id
JOIN plantas p ON p.id = s.planta_id
JOIN centros c ON c.id = p.centro_id
JOIN usuarios u ON u.id = ie.profesor_id
WHERE ie.resuelta = FALSE AND ie.estado = 'ko';

-- ============================================================
-- DATOS INICIALES (SEED)
-- ============================================================
INSERT INTO centros (nombre, direccion, estado) VALUES
('IES Ramón y Cajal', 'Calle Mayor 12, Madrid',        'activo'),
('IES Cervantes',     'Avda. del Parque 45, Alcalá',   'activo');

INSERT INTO plantas (centro_id, nombre) VALUES
(1,'Planta Baja'),(1,'Primera Planta'),(1,'Segunda Planta'),
(2,'Planta Baja'),(2,'Primera Planta');

INSERT INTO salas (planta_id, nombre, codigo, tipo, capacidad) VALUES
(1,'Aula 001',           'A001',  'aula',         30),
(1,'Sala de Reuniones',  'SR01',  'sala_reunion',  15),
(2,'Laboratorio TIC',    'LAB01', 'laboratorio',   25),
(2,'Aula 201',           'A201',  'aula',          30),
(3,'Salón de Actos',     'SA01',  'salon',        120),
(4,'Aula B01',           'B001',  'aula',          28),
(5,'Lab. Ciencias',      'LBCI1', 'laboratorio',   20);

-- Contraseñas: admin123 | prof123 | alumno123
INSERT INTO usuarios (nombre, email, password_hash, rol, centro_id) VALUES
('Administrador',       'admin@ies.es',   crypt('admin123', gen_salt('bf')), 'admin',      1),
('Prof. Ana García',    'ana@ies.es',     crypt('prof123',  gen_salt('bf')), 'profesorado',1),
('Prof. Luis Martín',   'luis@ies.es',    crypt('prof123',  gen_salt('bf')), 'profesorado',1),
('Carlos Pérez',        'carlos@ies.es',  crypt('alumno123',gen_salt('bf')), 'alumnado',   1),
('María López',         'maria@ies.es',   crypt('alumno123',gen_salt('bf')), 'alumnado',   1),
('Admin Centro 2',      'admin2@ies.es',  crypt('admin123', gen_salt('bf')), 'admin',      2),
('Prof. Elena Ruiz',    'elena@ies2.es',  crypt('prof123',  gen_salt('bf')), 'profesorado',2);

INSERT INTO materiales (centro_id, nombre, categoria, cantidad_total, cantidad_disponible, descripcion) VALUES
(1,'Portátil Dell Latitude',   'portatiles',       10,10,'Dell Latitude 5520, i5, 16 GB'),
(1,'Portátil HP ProBook',      'portatiles',        5, 5,'HP ProBook 450, i7, 8 GB'),
(1,'Lápiz Digital Wacom',      'lapices_digitales',15,15,'Wacom Intuos Pro S'),
(1,'Proyector Epson EB-X51',   'proyectores',       3, 3,'Epson EB-X51, HDMI/VGA'),
(1,'Balón de Fútbol',          'material_deportivo',8, 8,'Tamaño 5, oficial'),
(1,'Trípode Cámara',           'audiovisual',       4, 4,'Trípode universal 1.8 m'),
(2,'Portátil Lenovo ThinkPad', 'portatiles',        8, 8,'ThinkPad T14, Ryzen 5');

INSERT INTO ordenadores (sala_id, etiqueta, cpu, ram, disco, sistema_operativo, fila, columna, estado) VALUES
(3,'PC-01','Intel i5-10400','8GB', '256GB SSD','Ubuntu 22.04',1,1,'ok'),
(3,'PC-02','Intel i5-10400','8GB', '256GB SSD','Ubuntu 22.04',1,2,'ok'),
(3,'PC-03','Intel i5-10400','8GB', '256GB SSD','Ubuntu 22.04',1,3,'ko'),
(3,'PC-04','Intel i5-10400','8GB', '256GB SSD','Ubuntu 22.04',2,1,'ok'),
(3,'PC-05','Intel i5-10400','8GB', '256GB SSD','Ubuntu 22.04',2,2,'ok'),
(3,'PC-06','Intel i5-10400','16GB','512GB SSD','Windows 11',  2,3,'ok');

INSERT INTO incidencias_equipo (ordenador_id, profesor_id, estado, descripcion, resuelta)
VALUES (3, 2, 'ko', 'No arranca: pantalla en negro tras POST. Posible fallo en disco.', FALSE);

INSERT INTO eventos (sala_id, profesor_id, titulo, descripcion, tipo, inicio, fin, aforo_estimado) VALUES
(1,2,'Examen Parcial DAW',      'HTML/CSS módulo 2',       'examen',   NOW()+INTERVAL '1 day',   NOW()+INTERVAL '1 day 2 hours',   28),
(5,3,'Charla Ciberseguridad',   'Ponente externo INCIBE',  'charla',   NOW()+INTERVAL '3 days',  NOW()+INTERVAL '3 days 90 min',   80),
(2,2,'Tutoría Grupal 1DAW',     'Resolución de dudas',     'tutoria',  NOW()+INTERVAL '2 days',  NOW()+INTERVAL '2 days 1 hour',   14),
(3,3,'Práctica Bases de Datos', 'SQL avanzado PostgreSQL', 'actividad',NOW()+INTERVAL '4 days',  NOW()+INTERVAL '4 days 2 hours',  24);
