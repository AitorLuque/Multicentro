require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { auth, role } = require('./middleware/auth');

const app  = express();
const isProduction = process.env.NODE_ENV === 'production';

// Inicialización de conexión PostgreSQL con forzado de protocolo SSL para producción en nube (IPv4)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// Helper optimizado de ejecución de consultas SQL nativas
const q = (text, params) => pool.query(text, params).then(r => r.rows);

// ============================================================
// SISTEMA DE CONTROL DE ACCESO (AUTENTICACIÓN)
// ============================================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  
  try {
    // Permite login por correo o directamente escribiendo 'rberben' en la caja de texto
    const [user] = await q(
      'SELECT * FROM usuarios WHERE (LOWER(TRIM(email)) = LOWER(TRIM($1)) OR username = $1) AND activo=TRUE', 
      [email]
    );
    
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

    // Payload limpio de token de sesión sin metadatos multicentro
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    
    res.json({ 
      token, 
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, username: user.username } 
    });
  } catch (err) {
    console.error('Error crítico login:', err);
    res.status(500).json({ error: 'Error interno en el servidor de control.' });
  }
});

// ============================================================
// SERVICIOS CORE DEL CUADRO DE MANDOS (DASHBOARD GLOBAL)
// ============================================================
app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const [
      totalSalas,
      salasLibres,
      prestamosActivos,
      incidenciasAbiertas,
      proximosEventos,
      totalMateriales
    ] = await Promise.all([
      q("SELECT COUNT(*) FROM salas WHERE estado='ok'"),
      q("SELECT COUNT(*) FROM salas WHERE estado='ok' AND id NOT IN (SELECT sala_id FROM eventos WHERE estado='activo' AND NOW() BETWEEN inicio AND fin)"),
      q("SELECT COUNT(*) FROM prestamos_material WHERE estado='prestado'"),
      q("SELECT COUNT(*) FROM incidencias_equipo WHERE resuelta=FALSE"),
      q(`SELECT e.id, e.titulo, e.tipo, e.inicio, e.fin, s.nombre AS sala, u.nombre AS profesor
         FROM eventos e
         JOIN salas s ON s.id=e.sala_id
         JOIN usuarios u ON u.id=e.profesor_id
         WHERE e.estado='activo' AND e.inicio > NOW()
         ORDER BY e.inicio LIMIT 5`),
      q("SELECT COUNT(*) FROM materiales WHERE activo=TRUE")
    ]);

    res.json({
      totalSalas:          parseInt(totalSalas[0].count),
      salasLibres:         parseInt(salasLibres[0].count),
      prestamosActivos:    parseInt(prestamosActivos[0].count),
      incidenciasAbiertas: parseInt(incidenciasAbiertas[0].count),
      proximosEventos,
      totalMateriales:     parseInt(totalMateriales[0].count)
  });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fallo al computar métricas generales.' });
  }
});

// ============================================================
// INFRAESTRUCTURA DE EDIFICIOS
// ============================================================
app.get('/api/plantas', auth, async (req, res) => {
  try {
    const rows = await q('SELECT * FROM plantas ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al recuperar catálogo de plantas.' });
  }
});

app.get('/api/salas', auth, async (req, res) => {
  try {
    const rows = await q('SELECT s.*, p.nombre AS planta_nombre FROM salas s JOIN plantas p ON p.id=s.planta_id ORDER BY s.nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al recuperar listado de aulas.' });
  }
});

// ============================================================
// RESERVAS DE AULAS (CALENDARIO)
// ============================================================
app.get('/api/eventos', auth, async (req, res) => {
  try {
    const rows = await q(`
      SELECT e.*, s.nombre AS sala_nombre, u.nombre AS profesor_nombre 
      FROM eventos e 
      JOIN salas s ON s.id=e.sala_id 
      JOIN usuarios u ON u.id=e.profesor_id 
      WHERE e.estado='activo'
      ORDER BY e.inicio
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al mapear la agenda.' });
  }
});

app.post('/api/eventos', auth, async (req, res) => {
  const { sala_id, titulo, descripcion, tipo, inicio, fin } = req.body;
  try {
    const solapados = await q(
      `SELECT * FROM eventos WHERE sala_id=$1 AND estado='activo' AND NOT (fin <= $2 OR inicio >= $3)`,
      [sala_id, inicio, fin]
    );
    if (solapados.length > 0) return res.status(400).json({ error: 'El aula ya dispone de una reserva confirmada en esta misma hora.' });

    await q(
      `INSERT INTO eventos (sala_id, profesor_id, titulo, descripcion, tipo, inicio, fin) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sala_id, req.user.id, titulo, descripcion, tipo, inicio, fin]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al formalizar la reserva de aula.' });
  }
});

// ============================================================
// INVENTARIO DE INSUMOS Y RECURSOS MÓVILES
// ============================================================
app.get('/api/materiales', auth, async (req, res) => {
  try {
    const rows = await q('SELECT * FROM materiales WHERE activo=TRUE ORDER BY nombre');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al recuperar inventario de materiales.' });
  }
});

app.get('/api/prestamos', auth, async (req, res) => {
  try {
    const rows = await q(`
      SELECT pm.*, m.nombre AS material_nombre, u.nombre AS profesor_nombre 
      FROM prestamos_material pm 
      JOIN materiales m ON m.id=pm.material_id 
      JOIN usuarios u ON u.id=pm.profesor_id 
      ORDER BY pm.inicio DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al volcar auditoría de préstamos.' });
  }
});

app.post('/api/prestamos', auth, async (req, res) => {
  const { material_id, uds, fin_previsto, notas } = req.body;
  try {
    const [mat] = await q('SELECT disponibles FROM materiales WHERE id=$1', [material_id]);
    if (!mat || mat.disponibles < uds) return res.status(400).json({ error: 'Existencias insuficientes para satisfacer la dotación requerida.' });

    await q('BEGIN');
    await q('UPDATE materiales SET disponibles = disponibles - $1 WHERE id=$2', [uds, material_id]);
    await q(`INSERT INTO prestamos_material (material_id, profesor_id, uds, fin_previsto, notas) 
             VALUES ($1, $2, $3, $4, $5)`, [material_id, req.user.id, uds, fin_previsto, notas]);
    await q('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await q('ROLLBACK');
    res.status(500).json({ error: 'Error transaccional en préstamo.' });
  }
});

app.post('/api/prestamos/:id/devolver', auth, async (req, res) => {
  try {
    const [prestamo] = await q("SELECT * FROM prestamos_material WHERE id=$1 AND estado='prestado'", [req.params.id]);
    if (!prestamo) return res.status(404).json({ error: 'Ficha de adjudicación inactiva o previamente devuelta.' });

    await q('BEGIN');
    await q("UPDATE prestamos_material SET estado='devuelto', fin_real=NOW() WHERE id=$1", [req.params.id]);
    await q('UPDATE materiales SET disponibles = disponibles + $1 WHERE id=$2', [prestamo.uds, prestamo.material_id]);
    await q('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await q('ROLLBACK');
    res.status(500).json({ error: 'Fallo al procesar retorno físico.' });
  }
});

// ============================================================
// MAPAS HARDWARE E INFORMÁTICA DE AULAS
// ============================================================
app.get('/api/ordenadores/sala/:salaId', auth, async (req, res) => {
  try {
    const rows = await q('SELECT * FROM ordenadores WHERE sala_id=$1 ORDER BY fila, columna', [req.params.salaId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al escanear terminales.' });
  }
});

app.post('/api/incidencias', auth, async (req, res) => {
  const { ordenador_id, descripcion } = req.body;
  try {
    await q('BEGIN');
    await q(`INSERT INTO incidencias_equipo (ordenador_id, profesor_id, descripcion) VALUES ($1, $2, $3)`, [ordenador_id, req.user.id, descripcion]);
    await q("UPDATE ordenadores SET estado='ko' WHERE id=$1", [ordenador_id]);
    await q('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await q('ROLLBACK');
    res.status(500).json({ error: 'Fallo al asentar informe de avería.' });
  }
});

app.get('/api/incidencias', auth, role('admin'), async (req, res) => {
  try {
    const rows = await q(`
      SELECT ie.*, o.etiqueta, s.nombre AS sala_nombre, u.nombre AS profesor_nombre 
      FROM incidencias_equipo ie 
      JOIN ordenadores o ON o.id=ie.ordenador_id 
      JOIN salas s ON s.id=o.sala_id 
      JOIN usuarios u ON u.id=ie.profesor_id 
      ORDER BY ie.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al compilar incidencias globales.' });
  }
});

app.post('/api/incidencias/:id/resolver', auth, role('admin'), async (req, res) => {
  const { comentario_resolucion, nuevo_estado_equipo } = req.body;
  try {
    const [incidencia] = await q('SELECT ordenador_id FROM incidencias_equipo WHERE id=$1', [req.params.id]);
    if (!incidencia) return res.status(404).json({ error: 'Registro de incidencia inexistente.' });

    await q('BEGIN');
    await q(`UPDATE incidencias_equipo 
             SET resuelta=TRUE, fecha_resolucion=NOW(), comentario_resolucion=$1, estado=$2 
             WHERE id=$3`, [comentario_resolucion, nuevo_estado_equipo, req.params.id]);
    await q('UPDATE ordenadores SET estado=$1 WHERE id=$2', [nuevo_estado_equipo, incidencia.ordenador_id]);
    await q('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await q('ROLLBACK');
    res.status(500).json({ error: 'Fallo al archivar resolución.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[CEIP Miguel Hernández API] Corriendo de forma exclusiva en puerto ${PORT}`);
});