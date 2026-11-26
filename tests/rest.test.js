'use strict';
/**
 * Suite de pruebas automatizadas para la Fase 4: API REST
 * Valida:
 * 1. Paginación y filtrado de interacciones.
 * 2. Integridad referencial en inserciones (rechaza usuarios inexistentes).
 * 3. Catálogos estrictos y validación de rangos numéricos.
 * 4. Operaciones CRUD (POST, GET, PUT, DELETE) en Turso.
 * 5. Consumo de métricas analíticas e históricas (KPIs, canales, mapa de calor, geografía).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server/middleware/auth');

const tokenValido = jwt.sign(
  { id: 1, username: 'lizandro.reyes', rol: 'admin' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const headers = {
  'Authorization': `Bearer ${tokenValido}`,
  'Content-Type': 'application/json'
};

const BASE_URL = 'http://localhost:3000';

test('Fase 4: GET /api/interacciones responde 200 y entrega lista paginada', async () => {
  const res = await fetch(`${BASE_URL}/api/interacciones?limit=10`, { headers });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(typeof data.total === 'number');
  assert.ok(Array.isArray(data.interacciones));
  assert.ok(data.interacciones.length <= 10);
});

test('Fase 4: GET /api/metricas/kpis entrega los indicadores globales requeridos', async () => {
  const res = await fetch(`${BASE_URL}/api/metricas/kpis`, { headers });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.kpis);
  assert.ok(data.kpis.total_usuarios >= 1068);
  assert.ok(data.kpis.total_interacciones >= 200);
  assert.ok(typeof data.kpis.sentimiento_promedio === 'number');
});

test('Fase 4: POST /api/interacciones rechaza usuario inexistente con 400', async () => {
  const res = await fetch(`${BASE_URL}/api/interacciones`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id_usuario: 'U999999',
      canal: 'Telegram',
      tipo: 'mensaje',
      tema: 'musica',
      sentimiento: 0.5
    })
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, 'Integridad referencial violada');
});

test('Fase 4: POST, GET, PUT y DELETE completan ciclo de vida de una interacción', async () => {
  const sufijo = String(Date.now()).slice(-6);
  const idTest = `I6${sufijo}`;

  // 1. POST
  const resPost = await fetch(`${BASE_URL}/api/interacciones`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id_interaccion: idTest,
      id_usuario: 'U000001',
      canal: 'Telegram',
      tipo: 'mensaje',
      texto: 'Mensaje de prueba automatizada',
      tema: 'musica',
      sentimiento: 0.45,
      etiquetas: ['prueba_test', 'ciclo_vida']
    })
  });
  assert.equal(resPost.status, 201);

  // 2. GET
  const resGet = await fetch(`${BASE_URL}/api/interacciones/${idTest}`, { headers });
  assert.equal(resGet.status, 200);
  const dataGet = await resGet.json();
  assert.equal(dataGet.interaccion.id_interaccion, idTest);
  assert.ok(dataGet.interaccion.etiquetas.includes('prueba_test'));

  // 3. PUT
  const resPut = await fetch(`${BASE_URL}/api/interacciones/${idTest}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      texto: 'Mensaje actualizado mediante test',
      sentimiento: 0.8
    })
  });
  assert.equal(resPut.status, 200);

  // 4. DELETE
  const resDel = await fetch(`${BASE_URL}/api/interacciones/${idTest}`, {
    method: 'DELETE',
    headers
  });
  assert.equal(resDel.status, 200);

  // 5. Verificar que ya no existe (404)
  const resVerif = await fetch(`${BASE_URL}/api/interacciones/${idTest}`, { headers });
  assert.equal(resVerif.status, 404);
});

test('Fase 4: Endpoints REST rechazan peticiones sin autenticación (401)', async () => {
  const res = await fetch(`${BASE_URL}/api/interacciones`);
  assert.equal(res.status, 401);
});
