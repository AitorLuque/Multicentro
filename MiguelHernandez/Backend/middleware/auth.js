const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acceso no proporcionado.' });
  }
  const token = header.split(' ')[1];
  try {
    // Almacena id, nombre, email, rol y username del profesor actual
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada o token no válido.' });
  }
}

function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ error: 'Acceso denegado: Privilegios insuficientes.' });
    }
    next();
  };
}

module.exports = { auth, role };