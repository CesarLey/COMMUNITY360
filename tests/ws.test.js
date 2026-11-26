'use strict';
/**
 * Suite de pruebas automatizadas para la Fase 5: WebSockets
 * Valida:
 * 1. Establecimiento de conexión bidireccional con el servidor en ws://localhost:3000/ws.
 * 2. Recepción del mensaje de bienvenida y métricas iniciales al conectarse.
 * 3. Retransmisión de eventos en tiempo real al crear una interacción vía REST (POST).
 * 4. Retransmisión de eventos en tiempo real al modificar una interacción vía REST (PUT).
 * 5. Retransmisión de eventos en tiempo real al eliminar una interacción vía REST (DELETE).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const { WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server/middleware/auth');

const token = jwt.sign({ id: 1, username: 'lizandro.reyes', rol: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

const BASE_HTTP = 'http://localhost:3000';
const BASE_WS = 'ws://localhost:3000/ws';

test('Fase 5: Conexión WebSocket y recepción reactiva ante operaciones REST (POST, PUT, DELETE)', async () => {
  const ws = new WebSocket(BASE_WS);

  const eventosRecibidos = [];

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString());
        eventosRecibidos.push(parsed);
      } catch (e) {}
    });
  });

  const esperarEvento = async (predicado, maxMs = 4000) => {
    const inicio = Date.now();
    while (Date.now() - inicio < maxMs) {
      const encontrado = eventosRecibidos.find(predicado);
      if (encontrado) return encontrado;
      await new Promise(r => setTimeout(r, 80));
    }
    return undefined;
  };

  try {
    // Verificar conexión establecida
    assert.ok(ws.readyState === WebSocket.OPEN, 'El WebSocket debe estar abierto');

    // Esperar el evento inicial de bienvenida o métricas
    const inicial = await esperarEvento(e => e.tipo === 'CONEXION_ESTABLECIDA' || e.tipo === 'METRICAS_INICIALES');
    assert.ok(inicial);

    // 1. Disparar POST en la API REST -> el socket debe recibir INTERACCION_CREADA
    const sufijo = String(Date.now()).slice(-6);
    const idWs = `I7${sufijo}`;
    const resPost = await fetch(`${BASE_HTTP}/api/interacciones`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id_interaccion: idWs,
        id_usuario: 'U000001',
        canal: 'Discord',
        tipo: 'mensaje',
        texto: 'Mensaje de prueba para WebSocket',
        tema: 'fursuits',
        sentimiento: 0.9,
        etiquetas: ['websocket', 'fase5']
      })
    });
    assert.equal(resPost.status, 201);

    const eventoCreado = await esperarEvento(e => e.tipo === 'INTERACCION_CREADA' && e.evento?.interaccion?.id_interaccion === idWs);
    assert.ok(eventoCreado, 'Debe haber recibido el evento INTERACCION_CREADA vía WebSocket');
    assert.equal(eventoCreado.evento?.interaccion?.id_interaccion, idWs);
    assert.ok(eventoCreado.metricas, 'Debe incluir las métricas actualizadas');

    // 2. Disparar PUT en la API REST -> el socket debe recibir INTERACCION_ACTUALIZADA
    const resPut = await fetch(`${BASE_HTTP}/api/interacciones/${idWs}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        texto: 'Texto modificado para test de WS',
        sentimiento: -0.2
      })
    });
    assert.equal(resPut.status, 200);

    const eventoActualizado = await esperarEvento(e => e.tipo === 'INTERACCION_ACTUALIZADA' && e.evento?.id_interaccion === idWs);
    assert.ok(eventoActualizado, 'Debe haber recibido el evento INTERACCION_ACTUALIZADA vía WebSocket');
    assert.equal(eventoActualizado.evento?.id_interaccion, idWs);

    // 3. Disparar DELETE en la API REST -> el socket debe recibir INTERACCION_ELIMINADA
    const resDel = await fetch(`${BASE_HTTP}/api/interacciones/${idWs}`, {
      method: 'DELETE',
      headers
    });
    assert.equal(resDel.status, 200);

    const eventoEliminado = await esperarEvento(e => e.tipo === 'INTERACCION_ELIMINADA' && e.evento?.id_interaccion === idWs);
    assert.ok(eventoEliminado, 'Debe haber recibido el evento INTERACCION_ELIMINADA vía WebSocket');
    assert.equal(eventoEliminado.evento?.id_interaccion, idWs);
  } finally {
    ws.close();
  }
});
