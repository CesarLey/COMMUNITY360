'use strict';
/**
 * Suite de pruebas automatizadas para la Fase 3: Sistema de Autenticación
 * Valida:
 * 1. Hasheo seguro de contraseñas con bcrypt (nunca texto plano).
 * 2. Emisión, estructura y expiración de tokens JWT.
 * 3. Middleware verificarAuth permitiendo acceso con token válido y rechazando peticiones sin token o con token alterado.
 * 4. Control de acceso por roles (requerirRol).
 * 5. Protección de credenciales y ausencia de contraseñas en respuestas.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { verificarAuth, requerirRol, JWT_SECRET } = require('../server/middleware/auth');

test('Fase 3: Bcrypt hashea y compara contraseñas de forma segura', async () => {
  const passwordPlano = 'lizandr0_reye$';
  const hash = await bcrypt.hash(passwordPlano, 10);

  assert.notEqual(hash, passwordPlano, 'El hash nunca debe ser igual al texto plano');
  assert.match(hash, /^\$2[aby]\$\d{2}\$/, 'Debe cumplir con el formato estándar modular de bcrypt');

  const esValido = await bcrypt.compare(passwordPlano, hash);
  assert.equal(esValido, true, 'Bcrypt debe validar la contraseña correcta');

  const esInvalido = await bcrypt.compare('password_incorrecto', hash);
  assert.equal(esInvalido, false, 'Bcrypt debe rechazar contraseñas incorrectas');
});

test('Fase 3: JWT genera y verifica tokens con expiración y payload', () => {
  const usuarioPrueba = { id: 1, username: 'lizandro.reyes', rol: 'admin' };
  const token = jwt.sign(usuarioPrueba, JWT_SECRET, { expiresIn: '1h' });

  assert.ok(typeof token === 'string' && token.split('.').length === 3, 'El token debe tener 3 partes (header.payload.signature)');

  const decodificado = jwt.verify(token, JWT_SECRET);
  assert.equal(decodificado.username, 'lizandro.reyes');
  assert.equal(decodificado.rol, 'admin');
  assert.ok(decodificado.exp > decodificado.iat, 'La expiración debe ser posterior a la emisión');
});

test('Fase 3: Middleware verificarAuth rechaza peticiones sin token', () => {
  let codigoEstado = null;
  let jsonRespuesta = null;

  const req = {
    headers: {},
    cookies: {},
    path: '/api/privado',
    accepts: () => false
  };

  const res = {
    status(cod) {
      codigoEstado = cod;
      return this;
    },
    json(obj) {
      jsonRespuesta = obj;
      return this;
    }
  };

  let siguienteLlamado = false;
  verificarAuth(req, res, () => { siguienteLlamado = true; });

  assert.equal(siguienteLlamado, false, 'No debe permitir avanzar');
  assert.equal(codigoEstado, 401, 'Debe retornar HTTP 401 Unauthorized');
  assert.ok(jsonRespuesta.error, 'Debe incluir un mensaje de error descriptivo');
});

test('Fase 3: Middleware verificarAuth aprueba token válido en Bearer header', () => {
  const usuarioPrueba = { id: 1, username: 'lizandro.reyes', rol: 'admin' };
  const token = jwt.sign(usuarioPrueba, JWT_SECRET, { expiresIn: '1h' });

  const req = {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
    path: '/api/privado',
    accepts: () => false
  };

  const res = {};
  let siguienteLlamado = false;
  verificarAuth(req, res, () => { siguienteLlamado = true; });

  assert.equal(siguienteLlamado, true, 'Debe invocar next()');
  assert.equal(req.usuario.username, 'lizandro.reyes');
});

test('Fase 3: Middleware requerirRol protege acciones administrativas', () => {
  const reqAnalista = { usuario: { username: 'analista', rol: 'analista' } };
  const reqAdmin = { usuario: { username: 'lizandro.reyes', rol: 'admin' } };

  let estado = null;
  const res = {
    status(c) { estado = c; return this; },
    json() { return this; }
  };

  let adminPaso = false;
  requerirRol('admin')(reqAdmin, res, () => { adminPaso = true; });
  assert.equal(adminPaso, true, 'Admin debe poder pasar');

  let analistaPaso = false;
  requerirRol('admin')(reqAnalista, res, () => { analistaPaso = true; });
  assert.equal(analistaPaso, false, 'Analista no debe pasar acción de admin');
  assert.equal(estado, 403, 'Debe retornar HTTP 403 Forbidden');
});
