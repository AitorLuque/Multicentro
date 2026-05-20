const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación JWT.
 * Añade req.user con { id, nombre, email, rol, centro_id }.
 */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado.' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

/**
 * Fábrica de middleware que comprueba que el rol del usuario
 * está entre los roles permitidos.
 * @param {...string} roles  Ej: role('admin'), role('admin','profesorado')
 */
function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
    next();
  };
}

module.exports = { auth, role };
