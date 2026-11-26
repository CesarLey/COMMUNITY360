'use strict';
/**
 * COMMUNITY 360 - Módulo WebSocket (Fase 5)
 * Administra conexiones de clientes WebSocket y retransmite eventos
 * reactivos cuando se crean, modifican o eliminan interacciones.
 */
const { WebSocketServer, WebSocket } = require('ws');
const turso = require('./db');

let wss = null;

/**
 * Inicializa el servidor WebSocket adjunto al servidor HTTP
 */
function inicializarWS(servidorHttp) {
  wss = new WebSocketServer({ server: servidorHttp, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Enviar mensaje de bienvenida y estado inicial
    ws.send(JSON.stringify({
      tipo: 'CONEXION_ESTABLECIDA',
      mensaje: 'Conexión WebSocket activa con el servidor Community 360',
      timestamp: new Date().toISOString()
    }));

    // Enviar métricas actuales al cliente recién conectado
    try {
      const metricas = await obtenerMetricasActuales();
      ws.send(JSON.stringify({
        tipo: 'METRICAS_INICIALES',
        data: metricas
      }));
    } catch (err) {
      console.error('Error al enviar métricas iniciales por WS:', err.message);
    }

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.tipo === 'PING') {
          ws.send(JSON.stringify({ tipo: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // Ignorar mensajes no JSON
      }
    });

    ws.on('error', (error) => {
      console.error('Error en socket cliente:', error.message);
    });
  });

  return wss;
}

/**
 * Consulta las métricas dinámicas vigentes en Turso
 */
async function obtenerMetricasActuales() {
  const [interRes, sentRes, canalesRes, riesgoRes] = await Promise.all([
    turso.execute('SELECT COUNT(*) AS total FROM interacciones'),
    turso.execute('SELECT ROUND(AVG(sentimiento), 3) AS sentimiento_promedio FROM interacciones'),
    turso.execute('SELECT canal, COUNT(*) AS total FROM interacciones GROUP BY canal ORDER BY total DESC'),
    turso.execute("SELECT COUNT(*) AS en_riesgo FROM usuarios WHERE estatus = 'en_riesgo'")
  ]);

  return {
    total_interacciones: interRes.rows[0]?.total || 0,
    sentimiento_promedio: sentRes.rows[0]?.sentimiento_promedio || 0,
    usuarios_en_riesgo: riesgoRes.rows[0]?.en_riesgo || 0,
    por_canal: canalesRes.rows
  };
}

/**
 * Transmite un evento a todos los navegadores/clientes conectados
 */
async function notificarCambio(tipoEvento, dataAdicional = {}) {
  if (!wss) return;

  try {
    const metricasActualizadas = await obtenerMetricasActuales();

    const payload = JSON.stringify({
      tipo: tipoEvento,
      timestamp: new Date().toISOString(),
      evento: dataAdicional,
      metricas: metricasActualizadas
    });

    wss.clients.forEach((cliente) => {
      if (cliente.readyState === WebSocket.OPEN) {
        cliente.send(payload);
      }
    });
  } catch (err) {
    console.error('Error transmitiendo evento WebSocket:', err.message);
  }
}

module.exports = {
  inicializarWS,
  notificarCambio,
  obtenerMetricasActuales
};
