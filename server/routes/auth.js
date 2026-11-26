'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const turso = require('../db');
const { verificarAuth, JWT_SECRET } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Recibe { identificador (username o correo), password }
 * Valida contra la base de datos Turso y genera un token JWT.
 */
router.post('/login', async (req, res) => {
  try {
    const { identificador, password } = req.body;

    if (!identificador || !password) {
      return res.status(400).json({
        error: 'Campos requeridos',
        mensaje: 'Debe proporcionar usuario/correo y contraseña.'
      });
    }

    const valorBuscado = String(identificador).trim().toLowerCase();

    // Consulta en Turso buscando por username o por email
    const resultado = await turso.execute({
      sql: `
        SELECT id_auth, username, email, password_hash, rol
        FROM usuarios_auth
        WHERE LOWER(username) = ? OR LOWER(email) = ?
        LIMIT 1
      `,
      args: [valorBuscado, valorBuscado]
    });

    if (resultado.rows.length === 0) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        mensaje: 'El usuario o contraseña no coinciden.'
      });
    }

    const user = resultado.rows[0];

    // Comparar contraseña con el hash bcrypt almacenado
    const coincide = await bcrypt.compare(password, user.password_hash);
    if (!coincide) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        mensaje: 'El usuario o contraseña no coinciden.'
      });
    }

    // Generar Token JWT con expiración de 8 horas
    const payload = {
      id: user.id_auth,
      username: user.username,
      email: user.email,
      rol: user.rol,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    // Guardar también en cookie httpOnly para comodidad del navegador
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 horas
    });

    return res.status(200).json({
      mensaje: 'Autenticación exitosa',
      token,
      usuario: payload
    });

  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'Ocurrió un error al procesar el inicio de sesión.'
    });
  }
});

/**
 * POST /api/auth/logout
 * Limpia la cookie de autenticación
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({
    mensaje: 'Sesión cerrada correctamente'
  });
});

/**
 * GET /api/auth/me
 * Endpoint protegido para consultar los datos del usuario logueado
 */
router.get('/me', verificarAuth, (req, res) => {
  return res.status(200).json({
    usuario: req.usuario
  });
});

module.exports = router;
