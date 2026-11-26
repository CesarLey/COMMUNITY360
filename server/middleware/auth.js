'use strict';
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_fallback_community360';

/**
 * Middleware para validar que la petición cuenta con un token JWT válido.
 * El token puede enviarse de dos formas:
 * 1) En el encabezado Authorization: Bearer <token> (para Postman / REST)
 * 2) En la cookie 'token' (para navegación web en el dashboard)
 */
function verificarAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  const esPeticionApi = req.originalUrl?.startsWith('/api/') || req.baseUrl?.startsWith('/api/') || req.path?.startsWith('/api/');

  if (!token) {
    if (!esPeticionApi && req.accepts('html')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({
      error: 'Acceso no autorizado',
      mensaje: 'Token de autenticación no proporcionado o ausente.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (err) {
    if (!esPeticionApi && req.accepts('html')) {
      return res.redirect('/login.html');
    }
    return res.status(403).json({
      error: 'Token inválido o expirado',
      mensaje: 'La sesión no es válida. Por favor, inicie sesión nuevamente.'
    });
  }
}

/**
 * Middleware opcional para restringir acceso por roles (ej: admin)
 */
function requerirRol(rolRequerido) {
  return (req, res, next) => {
    if (!req.usuario || req.usuario.rol !== rolRequerido) {
      return res.status(403).json({
        error: 'Permiso denegado',
        mensaje: `Esta acción requiere rol de ${rolRequerido}.`
      });
    }
    next();
  };
}

module.exports = {
  verificarAuth,
  requerirRol,
  JWT_SECRET,
};
