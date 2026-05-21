require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { auth, role } = require('./middleware/auth');

const app  = express();
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

const q = (text, params) => pool.query(text, params).then(r => r.rows);

// ============================================================
// AUTENTICACIÓN
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan campos.' });
  try {
    const loginLimpio = email.trim().toLowerCase();
    const [user] = await q(
      'SELECT * FROM usuarios WHERE (LOWER(TRIM(email)) = $1 OR LOWER(TRIM(username)) = $1) AND activo=TRUE', 
      [loginLimpio]
    );
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({ token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (err) {
    res.status(500).json({ error: 'Error de login.' });
  }
});

// ============================================================
// CONTROL DE USUARIOS / CLAUSTRO (NUEVAS FUNCIONES EXTRAÍDAS)
// ============================================================
app.get('/api/usuarios', auth, role('admin'), async (req, res) => {
  try {
    const rows = await q('SELECT id, username, nombre, email, rol, activo FROM usuarios ORDER BY nombre ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar usuarios.' });
  }
});

app.post('/api/usuarios', auth, role('admin'), async (req, res) => {
  const { username, nombre, email, password, rol } = req.body;
  if(!username || !nombre || !email || !password) return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await q(
      'INSERT INTO usuarios (username, nombre, email, password_hash, rol, activo) VALUES ($1, $2, $3, $4, $5, true)',
      [username.trim().toLowerCase(), nombre, email.trim().toLowerCase(), hash, rol || 'profesorado']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'El usuario o el correo electrónico ya están registrados.' });
  }
});

app.put('/api/usuarios/:id', auth, role('admin'), async (req, res) => {
  const { username, nombre, email, rol, activo, password } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await q(
        'UPDATE usuarios SET username=$1, nombre=$2, email=$3, rol=$4, activo=$5, password_hash=$6 WHERE id=$7',
        [username, nombre, email, rol, activo, hash, req.params.id]
      );
    } else {
      await q(
        'UPDATE usuarios SET username=$1, nombre=$2, email=$3, rol=$4, activo=$5 WHERE id=$6',
        [username, nombre, email, rol, activo, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar la ficha del usuario.' });
  }
});

// ============================================================
// DASHBOARD GLOBAL
// ============================================================
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const [totalSalas, salasLibres, prestamosActivos, incidenciasAbiertas, proximosEventos] = await Promise.all([
      q("SELECT COUNT(*) FROM salas WHERE estado='ok'"),
      q("SELECT COUNT(*) FROM salas WHERE estado='ok' AND id NOT IN (SELECT sala_id FROM eventos WHERE estado='activo' AND NOW() BETWEEN inicio AND fin)"),
      q("SELECT COUNT(*) FROM prestamos_material WHERE estado='prestado'"),
      q("SELECT COUNT(*) FROM incidencias_equipo WHERE resuelta=FALSE"),
      q(`SELECT e.id, e.titulo, e.tipo, e.inicio, e.fin, s.nombre AS sala, u.nombre AS profesor FROM eventos e JOIN salas s ON s.id=e.sala_id JOIN usuarios u ON u.id=e.profesor_id WHERE e.estado='activo' AND e.inicio > NOW() ORDER BY e.inicio LIMIT 5`)
    ]);
    res.json({
      totalSalas: parseInt(totalSalas[0].count),
      salasLibres: parseInt(salasLibres[0].count),
      prestamosActivos: parseInt(prestamosActivos[0].count),
      incidenciasAbiertas: parseInt(incidenciasAbiertas[0].count),
      proximosEventos
    });
  } catch (err) { res.status(500).json({ error: 'Error de panel.' }); }
});

// ============================================================
// AULAS Y AGENDAS
// ============================================================
app.get('/api/salas', auth, async (req, res) => {
  try { res.json(await q('SELECT * FROM salas ORDER BY nombre')); } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.get('/api/eventos', auth, async (req, res) => {
  try {
    res.json(await q(`SELECT e.*, s.nombre AS sala_nombre, u.nombre AS profesor_nombre FROM eventos e JOIN salas s ON s.id=e.sala_id JOIN usuarios u ON u.id=e.profesor_id WHERE e.estado='activo' ORDER BY e.inicio`));
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/eventos', auth, async (req, res) => {
  const { sala_id, titulo, descripcion, tipo, inicio, fin } = req.body;
  try {
    const solapados = await q(`SELECT * FROM eventos WHERE sala_id=$1 AND estado='activo' AND NOT (fin <= $2 OR inicio >= $3)`, [sala_id, inicio, fin]);
    if (solapados.length > 0) return res.status(400).json({ error: 'Horario ya ocupado.' });
    await q(`INSERT INTO eventos (sala_id, profesor_id, titulo, descripcion, tipo, inicio, fin) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [sala_id, req.user.id, titulo, descripcion, tipo, inicio, fin]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

// ============================================================
// MATERIALES
// ============================================================
app.get('/api/materiales', auth, async (req, res) => {
  try { res.json(await q('SELECT * FROM materiales WHERE activo=TRUE ORDER BY nombre')); } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.get('/api/prestamos', auth, async (req, res) => {
  try {
    res.json(await q(`SELECT pm.*, m.nombre AS material_nombre, u.nombre AS profesor_nombre FROM prestamos_material pm JOIN materiales m ON m.id=pm.material_id JOIN usuarios u ON u.id=pm.profesor_id ORDER BY pm.inicio DESC`));
  } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/prestamos', auth, async (req, res) => {
  const { material_id, uds, fin_previsto, notas } = req.body;
  try {
    const [mat] = await q('SELECT disponibles FROM materiales WHERE id=$1', [material_id]);
    if (!mat || mat.disponibles < uds) return res.status(400).json({ error: 'Unidades no disponibles.' });
    await q('BEGIN');
    await q('UPDATE materiales SET disponibles = disponibles - $1 WHERE id=$2', [uds, material_id]);
    await q(`INSERT INTO prestamos_material (material_id, profesor_id, uds, fin_previsto, notas) VALUES ($1, $2, $3, $4, $5)`, [material_id, req.user.id, uds, fin_previsto, notas]);
    await q('COMMIT'); res.json({ success: true });
  } catch (err) { await q('ROLLBACK'); res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/prestamos/:id/devolver', auth, async (req, res) => {
  try {
    const [p] = await q("SELECT * FROM prestamos_material WHERE id=$1 AND estado='prestado'", [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Inexistente.' });
    await q('BEGIN');
    await q("UPDATE prestamos_material SET estado='devuelto', fin_real=NOW() WHERE id=$1", [req.params.id]);
    await q('UPDATE materiales SET disponibles = disponibles + $1 WHERE id=$2', [p.uds, p.material_id]);
    await q('COMMIT'); res.json({ success: true });
  } catch (err) { await q('ROLLBACK'); res.status(500).json({ error: 'Error.' }); }
});

// ============================================================
// MAPAS ORDENADORES
// ============================================================
app.get('/api/ordenadores/sala/:salaId', auth, async (req, res) => {
  try { res.json(await q('SELECT * FROM ordenadores WHERE sala_id=$1 ORDER BY fila, columna', [req.params.salaId])); } catch (err) { res.status(500).json({ error: 'Error.' }); }
});

app.post('/api/incidencias', auth, async (req, res) => {
  const { ordenador_id, descripcion } = req.body;
  try {
    await q('BEGIN');
    await q(`INSERT INTO incidencias_equipo (ordenador_id, profesor_id, descripcion) VALUES ($1, $2, $3)`, [ordenador_id, req.user.id, descripcion]);
    await q("UPDATE ordenadores SET estado='ko' WHERE id=$1", [ordenador_id]);
    await q('COMMIT'); res.json({ success: true });
  } catch (err) { await q('ROLLBACK'); res.status(500).json({ error: 'Error.' }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));