require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { auth, role } = require('./middleware/auth');

const app  = express();
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'multicentro',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

app.use(cors());
app.use(express.json());

// Helper: ejecutar query y devolver rows
const q = (text, params) => pool.query(text, params).then(r => r.rows);

// ============================================================
// AUTH
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos.' });
  try {
    const [user] = await q(
      'SELECT * FROM usuarios WHERE email=$1 AND activo=TRUE', [email]
    );
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, email: user.email,
        rol: user.rol, centro_id: user.centro_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    const { password_hash, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const [u] = await q(
    'SELECT id,nombre,email,rol,grupo,centro_id,activo,created_at FROM usuarios WHERE id=$1',
    [req.user.id]
  );
  res.json(u);
});

// ============================================================
// CENTROS
// ============================================================
app.get('/api/centros', auth, async (req, res) => {
  res.json(await q('SELECT * FROM centros ORDER BY nombre'));
});

app.get('/api/centros/:id', auth, async (req, res) => {
  const [c] = await q('SELECT * FROM centros WHERE id=$1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Centro no encontrado.' });
  res.json(c);
});

app.post('/api/centros', auth, role('admin'), async (req, res) => {
  const { nombre, direccion, estado } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const [c] = await q(
    'INSERT INTO centros(nombre,direccion,estado) VALUES($1,$2,$3) RETURNING *',
    [nombre, direccion, estado || 'activo']
  );
  res.status(201).json(c);
});

app.put('/api/centros/:id', auth, role('admin'), async (req, res) => {
  const { nombre, direccion, estado } = req.body;
  const [c] = await q(
    'UPDATE centros SET nombre=$1,direccion=$2,estado=$3 WHERE id=$4 RETURNING *',
    [nombre, direccion, estado, req.params.id]
  );
  res.json(c);
});

app.delete('/api/centros/:id', auth, role('admin'), async (req, res) => {
  await q('DELETE FROM centros WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// PLANTAS
// ============================================================
app.get('/api/centros/:centroId/plantas', auth, async (req, res) => {
  res.json(await q('SELECT * FROM plantas WHERE centro_id=$1 ORDER BY nombre', [req.params.centroId]));
});

app.post('/api/centros/:centroId/plantas', auth, role('admin'), async (req, res) => {
  const { nombre, plano } = req.body;
  const [p] = await q(
    'INSERT INTO plantas(centro_id,nombre,plano) VALUES($1,$2,$3) RETURNING *',
    [req.params.centroId, nombre, plano]
  );
  res.status(201).json(p);
});

app.put('/api/plantas/:id', auth, role('admin'), async (req, res) => {
  const { nombre, plano } = req.body;
  const [p] = await q(
    'UPDATE plantas SET nombre=$1,plano=$2 WHERE id=$3 RETURNING *',
    [nombre, plano, req.params.id]
  );
  res.json(p);
});

app.delete('/api/plantas/:id', auth, role('admin'), async (req, res) => {
  await q('DELETE FROM plantas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// SALAS
// ============================================================
app.get('/api/salas', auth, async (req, res) => {
  const { centro_id, tipo } = req.query;
  let sql = `
    SELECT s.*, p.nombre AS planta_nombre, c.id AS centro_id, c.nombre AS centro_nombre
    FROM salas s
    JOIN plantas p ON p.id = s.planta_id
    JOIN centros c ON c.id = p.centro_id
    WHERE 1=1`;
  const params = [];
  if (centro_id) { params.push(centro_id); sql += ` AND c.id=$${params.length}`; }
  if (tipo)      { params.push(tipo);      sql += ` AND s.tipo=$${params.length}`; }
  sql += ' ORDER BY c.nombre, p.nombre, s.nombre';
  res.json(await q(sql, params));
});

app.get('/api/salas/:id', auth, async (req, res) => {
  const [s] = await q(`
    SELECT s.*, p.nombre AS planta_nombre, c.id AS centro_id, c.nombre AS centro_nombre
    FROM salas s
    JOIN plantas p ON p.id = s.planta_id
    JOIN centros c ON c.id = p.centro_id
    WHERE s.id=$1`, [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Sala no encontrada.' });
  res.json(s);
});

app.post('/api/salas', auth, role('admin'), async (req, res) => {
  const { planta_id, nombre, codigo, tipo, capacidad, ubicacion, estado } = req.body;
  try {
    const [s] = await q(
      `INSERT INTO salas(planta_id,nombre,codigo,tipo,capacidad,ubicacion,estado)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [planta_id, nombre, codigo, tipo, capacidad || 0, ubicacion, estado || 'activa']
    );
    res.status(201).json(s);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/salas/:id', auth, role('admin'), async (req, res) => {
  const { nombre, codigo, tipo, capacidad, ubicacion, estado } = req.body;
  const [s] = await q(
    `UPDATE salas SET nombre=$1,codigo=$2,tipo=$3,capacidad=$4,ubicacion=$5,estado=$6
     WHERE id=$7 RETURNING *`,
    [nombre, codigo, tipo, capacidad, ubicacion, estado, req.params.id]
  );
  res.json(s);
});

app.delete('/api/salas/:id', auth, role('admin'), async (req, res) => {
  await q('DELETE FROM salas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Ocupación de sala en un instante
app.get('/api/salas/:id/ocupacion', auth, async (req, res) => {
  const { when } = req.query; // ISO timestamp opcional
  const ts = when || 'NOW()';
  const rows = await q(`
    SELECT e.*, u.nombre AS profesor_nombre
    FROM eventos e
    JOIN usuarios u ON u.id = e.profesor_id
    WHERE e.sala_id=$1 AND e.estado='activo'
      AND $2::TIMESTAMPTZ BETWEEN e.inicio AND e.fin`,
    [req.params.id, when || new Date().toISOString()]
  );
  res.json(rows);
});

// ============================================================
// EVENTOS / RESERVAS
// ============================================================
app.get('/api/eventos', auth, async (req, res) => {
  const { sala_id, centro_id, desde, hasta, tipo } = req.query;
  let sql = `
    SELECT e.*, s.nombre AS sala_nombre, s.codigo AS sala_codigo,
           u.nombre AS profesor_nombre,
           c.nombre AS centro_nombre,
           (SELECT COUNT(*) FROM asistencia_evento ae WHERE ae.evento_id=e.id AND ae.confirmado=TRUE) AS confirmados
    FROM eventos e
    JOIN salas    s ON s.id = e.sala_id
    JOIN plantas  p ON p.id = s.planta_id
    JOIN centros  c ON c.id = p.centro_id
    JOIN usuarios u ON u.id = e.profesor_id
    WHERE 1=1`;
  const params = [];
  if (sala_id)   { params.push(sala_id);   sql += ` AND e.sala_id=$${params.length}`; }
  if (centro_id) { params.push(centro_id); sql += ` AND c.id=$${params.length}`; }
  if (tipo)      { params.push(tipo);      sql += ` AND e.tipo=$${params.length}`; }
  if (desde)     { params.push(desde);     sql += ` AND e.inicio >= $${params.length}`; }
  if (hasta)     { params.push(hasta);     sql += ` AND e.fin <= $${params.length}`; }
  sql += ' ORDER BY e.inicio DESC';
  res.json(await q(sql, params));
});

app.get('/api/eventos/:id', auth, async (req, res) => {
  const [e] = await q(`
    SELECT e.*, s.nombre AS sala_nombre, u.nombre AS profesor_nombre,
           c.nombre AS centro_nombre,
           (SELECT COUNT(*) FROM asistencia_evento ae WHERE ae.evento_id=e.id AND ae.confirmado=TRUE) AS confirmados
    FROM eventos e
    JOIN salas s ON s.id=e.sala_id
    JOIN plantas p ON p.id=s.planta_id
    JOIN centros c ON c.id=p.centro_id
    JOIN usuarios u ON u.id=e.profesor_id
    WHERE e.id=$1`, [req.params.id]);
  if (!e) return res.status(404).json({ error: 'Evento no encontrado.' });
  res.json(e);
});

app.post('/api/eventos', auth, role('admin','profesorado'), async (req, res) => {
  const { sala_id, titulo, descripcion, tipo, inicio, fin, aforo_estimado } = req.body;
  if (!sala_id || !titulo || !inicio || !fin)
    return res.status(400).json({ error: 'Campos obligatorios: sala_id, titulo, inicio, fin.' });
  try {
    const [e] = await q(
      `INSERT INTO eventos(sala_id,profesor_id,titulo,descripcion,tipo,inicio,fin,aforo_estimado)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [sala_id, req.user.id, titulo, descripcion, tipo||'general', inicio, fin, aforo_estimado||0]
    );
    res.status(201).json(e);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.put('/api/eventos/:id', auth, role('admin','profesorado'), async (req, res) => {
  const { titulo, descripcion, tipo, inicio, fin, aforo_estimado } = req.body;
  try {
    const [e] = await q(
      `UPDATE eventos SET titulo=$1,descripcion=$2,tipo=$3,inicio=$4,fin=$5,aforo_estimado=$6
       WHERE id=$7 AND (profesor_id=$8 OR $9='admin') RETURNING *`,
      [titulo, descripcion, tipo, inicio, fin, aforo_estimado, req.params.id, req.user.id, req.user.rol]
    );
    if (!e) return res.status(404).json({ error: 'Evento no encontrado o sin permisos.' });
    res.json(e);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.delete('/api/eventos/:id', auth, role('admin','profesorado'), async (req, res) => {
  const [e] = await q(
    `UPDATE eventos SET estado='cancelado'
     WHERE id=$1 AND (profesor_id=$2 OR $3='admin') RETURNING *`,
    [req.params.id, req.user.id, req.user.rol]
  );
  if (!e) return res.status(404).json({ error: 'Evento no encontrado o sin permisos.' });
  res.json({ ok: true, evento: e });
});

// Asistencia a eventos
app.post('/api/eventos/:id/asistencia', auth, role('alumnado'), async (req, res) => {
  const { confirmado } = req.body;
  const [a] = await q(
    `INSERT INTO asistencia_evento(evento_id, alumno_id, confirmado)
     VALUES($1,$2,$3)
     ON CONFLICT(evento_id,alumno_id) DO UPDATE SET confirmado=EXCLUDED.confirmado
     RETURNING *`,
    [req.params.id, req.user.id, confirmado !== false]
  );
  res.json(a);
});

app.get('/api/eventos/:id/asistencia', auth, async (req, res) => {
  const rows = await q(`
    SELECT ae.*, u.nombre AS alumno_nombre
    FROM asistencia_evento ae
    JOIN usuarios u ON u.id=ae.alumno_id
    WHERE ae.evento_id=$1`, [req.params.id]);
  res.json(rows);
});

// ============================================================
// MATERIALES
// ============================================================
app.get('/api/materiales', auth, async (req, res) => {
  const { centro_id, categoria } = req.query;
  let sql = `
    SELECT m.*, c.nombre AS centro_nombre
    FROM materiales m
    JOIN centros c ON c.id=m.centro_id
    WHERE m.activo=TRUE`;
  const params = [];
  if (centro_id) { params.push(centro_id); sql += ` AND m.centro_id=$${params.length}`; }
  if (categoria) { params.push(categoria); sql += ` AND m.categoria=$${params.length}`; }
  sql += ' ORDER BY m.categoria, m.nombre';
  res.json(await q(sql, params));
});

app.get('/api/materiales/:id', auth, async (req, res) => {
  const [m] = await q('SELECT * FROM materiales WHERE id=$1', [req.params.id]);
  if (!m) return res.status(404).json({ error: 'Material no encontrado.' });
  res.json(m);
});

app.post('/api/materiales', auth, role('admin'), async (req, res) => {
  const { centro_id, nombre, categoria, cantidad_total, descripcion } = req.body;
  const [m] = await q(
    `INSERT INTO materiales(centro_id,nombre,categoria,cantidad_total,cantidad_disponible,descripcion)
     VALUES($1,$2,$3,$4,$4,$5) RETURNING *`,
    [centro_id, nombre, categoria, cantidad_total||0, descripcion]
  );
  res.status(201).json(m);
});

app.put('/api/materiales/:id', auth, role('admin'), async (req, res) => {
  const { nombre, categoria, cantidad_total, descripcion, activo } = req.body;
  const [m] = await q(
    `UPDATE materiales SET nombre=$1,categoria=$2,cantidad_total=$3,descripcion=$4,activo=$5
     WHERE id=$6 RETURNING *`,
    [nombre, categoria, cantidad_total, descripcion, activo, req.params.id]
  );
  res.json(m);
});

// ============================================================
// PRÉSTAMOS DE MATERIAL
// ============================================================
app.get('/api/prestamos', auth, async (req, res) => {
  const { estado, profesor_id, material_id, centro_id } = req.query;
  let sql = `
    SELECT pm.*, m.nombre AS material_nombre, m.categoria,
           u.nombre AS profesor_nombre, c.nombre AS centro_nombre
    FROM prestamos_material pm
    JOIN materiales m ON m.id=pm.material_id
    JOIN usuarios   u ON u.id=pm.profesor_id
    JOIN centros    c ON c.id=m.centro_id
    WHERE 1=1`;
  const params = [];
  if (estado)      { params.push(estado);      sql += ` AND pm.estado=$${params.length}`; }
  if (profesor_id) { params.push(profesor_id); sql += ` AND pm.profesor_id=$${params.length}`; }
  if (material_id) { params.push(material_id); sql += ` AND pm.material_id=$${params.length}`; }
  if (centro_id)   { params.push(centro_id);   sql += ` AND m.centro_id=$${params.length}`; }
  sql += ' ORDER BY pm.fecha_salida DESC';
  res.json(await q(sql, params));
});

app.post('/api/prestamos', auth, role('admin','profesorado'), async (req, res) => {
  const { material_id, cantidad, observaciones } = req.body;
  try {
    const [p] = await q(
      `INSERT INTO prestamos_material(material_id,profesor_id,cantidad,observaciones)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [material_id, req.user.id, cantidad||1, observaciones]
    );
    res.status(201).json(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/prestamos/:id/devolver', auth, role('admin','profesorado'), async (req, res) => {
  const [p] = await q(
    `UPDATE prestamos_material
     SET estado='devuelto', fecha_devolucion=NOW(), observaciones=COALESCE($1,observaciones)
     WHERE id=$2 AND (profesor_id=$3 OR $4='admin') RETURNING *`,
    [req.body.observaciones, req.params.id, req.user.id, req.user.rol]
  );
  if (!p) return res.status(404).json({ error: 'Préstamo no encontrado o sin permisos.' });
  res.json(p);
});

// ============================================================
// ORDENADORES
// ============================================================
app.get('/api/salas/:salaId/ordenadores', auth, async (req, res) => {
  const rows = await q(`
    SELECT o.*,
      (SELECT json_agg(json_build_object('turno',ap.turno,'alumno_id',ap.alumno_id,'alumno',u.nombre))
       FROM asignaciones_puesto ap
       JOIN usuarios u ON u.id=ap.alumno_id
       WHERE ap.ordenador_id=o.id) AS asignaciones
    FROM ordenadores o
    WHERE o.sala_id=$1
    ORDER BY o.fila, o.columna, o.etiqueta`, [req.params.salaId]);
  res.json(rows);
});

app.post('/api/salas/:salaId/ordenadores', auth, role('admin','profesorado'), async (req, res) => {
  const { etiqueta, cpu, ram, disco, sistema_operativo, fila, columna, observaciones } = req.body;
  try {
    const [o] = await q(
      `INSERT INTO ordenadores(sala_id,etiqueta,cpu,ram,disco,sistema_operativo,fila,columna,observaciones)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.salaId, etiqueta, cpu, ram, disco, sistema_operativo, fila, columna, observaciones]
    );
    res.status(201).json(o);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/ordenadores/:id', auth, role('admin','profesorado'), async (req, res) => {
  const { etiqueta, cpu, ram, disco, sistema_operativo, fila, columna, observaciones } = req.body;
  const [o] = await q(
    `UPDATE ordenadores
     SET etiqueta=$1,cpu=$2,ram=$3,disco=$4,sistema_operativo=$5,fila=$6,columna=$7,observaciones=$8
     WHERE id=$9 RETURNING *`,
    [etiqueta, cpu, ram, disco, sistema_operativo, fila, columna, observaciones, req.params.id]
  );
  res.json(o);
});

app.delete('/api/ordenadores/:id', auth, role('admin','profesorado'), async (req, res) => {
  await q('DELETE FROM ordenadores WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Cambiar estado OK/KO
app.put('/api/ordenadores/:id/estado', auth, role('admin','profesorado'), async (req, res) => {
  const { estado, descripcion } = req.body;
  if (!['ok','ko','baja'].includes(estado))
    return res.status(400).json({ error: 'Estado debe ser ok, ko o baja.' });
  if (estado === 'ko' && !descripcion)
    return res.status(400).json({ error: 'Descripción obligatoria cuando estado=ko.' });

  const [o] = await q(
    'UPDATE ordenadores SET estado=$1 WHERE id=$2 RETURNING *',
    [estado, req.params.id]
  );
  if (!o) return res.status(404).json({ error: 'Ordenador no encontrado.' });

  const [inc] = await q(
    `INSERT INTO incidencias_equipo(ordenador_id,profesor_id,estado,descripcion,resuelta)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.id, req.user.id, estado, descripcion||null, estado==='ok']
  );

  // Si se resuelve, marcar incidencias anteriores
  if (estado === 'ok') {
    await q(
      `UPDATE incidencias_equipo SET resuelta=TRUE
       WHERE ordenador_id=$1 AND resuelta=FALSE`,
      [req.params.id]
    );
  }
  res.json({ ordenador: o, incidencia: inc });
});

// Asignación de alumnado a puestos
app.post('/api/ordenadores/:id/asignaciones', auth, role('admin','profesorado'), async (req, res) => {
  const { alumno_id, turno } = req.body;
  try {
    const [a] = await q(
      `INSERT INTO asignaciones_puesto(ordenador_id,alumno_id,turno)
       VALUES($1,$2,$3)
       ON CONFLICT(ordenador_id,turno) DO UPDATE SET alumno_id=EXCLUDED.alumno_id
       RETURNING *`,
      [req.params.id, alumno_id, turno]
    );
    res.status(201).json(a);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ordenadores/:id/asignaciones/:turno', auth, role('admin','profesorado'), async (req, res) => {
  await q(
    'DELETE FROM asignaciones_puesto WHERE ordenador_id=$1 AND turno=$2',
    [req.params.id, req.params.turno]
  );
  res.json({ ok: true });
});

// ============================================================
// INCIDENCIAS
// ============================================================
app.get('/api/incidencias', auth, async (req, res) => {
  const { sala_id, resuelta, centro_id } = req.query;
  let sql = `
    SELECT ie.*, o.etiqueta, s.nombre AS sala_nombre, s.codigo AS sala_codigo,
           c.nombre AS centro_nombre, u.nombre AS profesor_nombre
    FROM incidencias_equipo ie
    JOIN ordenadores o ON o.id=ie.ordenador_id
    JOIN salas s ON s.id=o.sala_id
    JOIN plantas p ON p.id=s.planta_id
    JOIN centros c ON c.id=p.centro_id
    JOIN usuarios u ON u.id=ie.profesor_id
    WHERE 1=1`;
  const params = [];
  if (sala_id)   { params.push(sala_id);   sql += ` AND o.sala_id=$${params.length}`; }
  if (centro_id) { params.push(centro_id); sql += ` AND c.id=$${params.length}`; }
  if (resuelta !== undefined) {
    params.push(resuelta === 'true');
    sql += ` AND ie.resuelta=$${params.length}`;
  }
  sql += ' ORDER BY ie.fecha DESC';
  res.json(await q(sql, params));
});

// ============================================================
// HISTORIALES
// ============================================================
app.get('/api/historiales/salas', auth, async (req, res) => {
  const { sala_id, centro_id, desde, hasta, profesor } = req.query;
  let sql = `
    SELECT hs.*, s.nombre AS sala_nombre, s.codigo,
           c.nombre AS centro_nombre, u.nombre AS usuario_nombre
    FROM historial_sala hs
    JOIN salas    s ON s.id = hs.sala_id
    JOIN plantas  p ON p.id = s.planta_id
    JOIN centros  c ON c.id = p.centro_id
    JOIN usuarios u ON u.id = hs.usuario_id
    WHERE 1=1`;
  const params = [];
  if (sala_id)   { params.push(sala_id);   sql += ` AND hs.sala_id=$${params.length}`; }
  if (centro_id) { params.push(centro_id); sql += ` AND c.id=$${params.length}`; }
  if (desde)     { params.push(desde);     sql += ` AND hs.fecha >= $${params.length}`; }
  if (hasta)     { params.push(hasta);     sql += ` AND hs.fecha <= $${params.length}`; }
  if (profesor)  { params.push(`%${profesor}%`); sql += ` AND u.nombre ILIKE $${params.length}`; }
  sql += ' ORDER BY hs.fecha DESC LIMIT 500';
  res.json(await q(sql, params));
});

app.get('/api/historiales/materiales', auth, async (req, res) => {
  const { material_id, centro_id, desde, hasta, profesor } = req.query;
  let sql = `
    SELECT hm.*, m.nombre AS material_nombre, m.categoria,
           c.nombre AS centro_nombre, u.nombre AS usuario_nombre
    FROM historial_material hm
    JOIN materiales m ON m.id = hm.material_id
    JOIN centros    c ON c.id = m.centro_id
    JOIN usuarios   u ON u.id = hm.usuario_id
    WHERE 1=1`;
  const params = [];
  if (material_id) { params.push(material_id); sql += ` AND hm.material_id=$${params.length}`; }
  if (centro_id)   { params.push(centro_id);   sql += ` AND c.id=$${params.length}`; }
  if (desde)       { params.push(desde);       sql += ` AND hm.fecha >= $${params.length}`; }
  if (hasta)       { params.push(hasta);       sql += ` AND hm.fecha <= $${params.length}`; }
  if (profesor)    { params.push(`%${profesor}%`); sql += ` AND u.nombre ILIKE $${params.length}`; }
  sql += ' ORDER BY hm.fecha DESC LIMIT 500';
  res.json(await q(sql, params));
});

// ============================================================
// USUARIOS (gestión)
// ============================================================
app.get('/api/usuarios', auth, role('admin'), async (req, res) => {
  const { rol, centro_id } = req.query;
  let sql = `
    SELECT u.id,u.nombre,u.email,u.rol,u.grupo,u.centro_id,u.activo,u.created_at,
           c.nombre AS centro_nombre
    FROM usuarios u
    LEFT JOIN centros c ON c.id=u.centro_id
    WHERE 1=1`;
  const params = [];
  if (rol)       { params.push(rol);       sql += ` AND u.rol=$${params.length}`; }
  if (centro_id) { params.push(centro_id); sql += ` AND u.centro_id=$${params.length}`; }
  sql += ' ORDER BY u.rol,u.nombre';
  res.json(await q(sql, params));
});

app.get('/api/usuarios/alumnado', auth, role('admin','profesorado'), async (req, res) => {
  const { centro_id } = req.query;
  const params = [centro_id || req.user.centro_id];
  const rows = await q(
    `SELECT id,nombre,email,grupo FROM usuarios
     WHERE rol='alumnado' AND activo=TRUE AND (centro_id=$1 OR $1 IS NULL)
     ORDER BY nombre`, params
  );
  res.json(rows);
});

app.post('/api/usuarios', auth, role('admin'), async (req, res) => {
  const { nombre, email, password, rol, grupo, centro_id } = req.body;
  if (!nombre || !email || !password || !rol)
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [u] = await q(
      `INSERT INTO usuarios(nombre,email,password_hash,rol,grupo,centro_id)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id,nombre,email,rol,grupo,centro_id,activo`,
      [nombre, email, hash, rol, grupo, centro_id]
    );
    res.status(201).json(u);
  } catch (err) {
    res.status(400).json({ error: 'Email ya registrado.' });
  }
});

app.put('/api/usuarios/:id', auth, role('admin'), async (req, res) => {
  const { nombre, email, rol, grupo, centro_id, activo } = req.body;
  const [u] = await q(
    `UPDATE usuarios SET nombre=$1,email=$2,rol=$3,grupo=$4,centro_id=$5,activo=$6
     WHERE id=$7 RETURNING id,nombre,email,rol,grupo,centro_id,activo`,
    [nombre, email, rol, grupo, centro_id, activo, req.params.id]
  );
  res.json(u);
});

app.put('/api/usuarios/:id/password', auth, async (req, res) => {
  // Solo el propio usuario o un admin puede cambiar la contraseña
  if (req.user.id !== parseInt(req.params.id) && req.user.rol !== 'admin')
    return res.status(403).json({ error: 'Sin permisos.' });
  const { password } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const hash = await bcrypt.hash(password, 10);
  await q('UPDATE usuarios SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
  res.json({ ok: true });
});

// ============================================================
// DASHBOARD / RESUMEN
// ============================================================
app.get('/api/dashboard', auth, async (req, res) => {
  const centro = req.user.centro_id;
  const [
    totalSalas, salasLibres, prestamosActivos, incidenciasAbiertas,
    proximosEventos, totalMateriales
  ] = await Promise.all([
    q(`SELECT COUNT(*) FROM salas s
       JOIN plantas p ON p.id=s.planta_id
       WHERE p.centro_id=$1 AND s.estado='activa'`, [centro]),
    q(`SELECT COUNT(*) FROM salas s
       JOIN plantas p ON p.id=s.planta_id
       WHERE p.centro_id=$1 AND s.estado='activa'
         AND s.id NOT IN (
           SELECT sala_id FROM eventos
           WHERE estado='activo' AND NOW() BETWEEN inicio AND fin
         )`, [centro]),
    q(`SELECT COUNT(*) FROM prestamos_material pm
       JOIN materiales m ON m.id=pm.material_id
       WHERE m.centro_id=$1 AND pm.estado='prestado'`, [centro]),
    q(`SELECT COUNT(*) FROM incidencias_equipo ie
       JOIN ordenadores o ON o.id=ie.ordenador_id
       JOIN salas s ON s.id=o.sala_id
       JOIN plantas p ON p.id=s.planta_id
       WHERE p.centro_id=$1 AND ie.resuelta=FALSE`, [centro]),
    q(`SELECT e.id,e.titulo,e.tipo,e.inicio,e.fin,
              s.nombre AS sala, u.nombre AS profesor
       FROM eventos e
       JOIN salas s ON s.id=e.sala_id
       JOIN plantas p ON p.id=s.planta_id
       JOIN usuarios u ON u.id=e.profesor_id
       WHERE p.centro_id=$1 AND e.estado='activo' AND e.inicio > NOW()
       ORDER BY e.inicio LIMIT 5`, [centro]),
    q(`SELECT COUNT(*) FROM materiales WHERE centro_id=$1 AND activo=TRUE`, [centro]),
  ]);

  res.json({
    totalSalas:          parseInt(totalSalas[0].count),
    salasLibres:         parseInt(salasLibres[0].count),
    prestamosActivos:    parseInt(prestamosActivos[0].count),
    incidenciasAbiertas: parseInt(incidenciasAbiertas[0].count),
    totalMateriales:     parseInt(totalMateriales[0].count),
    proximosEventos,
  });
});

// ============================================================
// ARRANQUE
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  Servidor escuchando en http://localhost:${PORT}`);
});
