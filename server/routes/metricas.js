'use strict';
const express = require('express');
const router = express.Router();
const turso = require('../db');
const { verificarAuth } = require('../middleware/auth');

// Todas las métricas están protegidas
router.use(verificarAuth);

/**
 * 6. GET /api/metricas/kpis
 * Tarjetas de indicadores clave (KPIs globales)
 */
router.get('/kpis', async (req, res) => {
  try {
    const [usuariosRes, riesgoRes, interaccionesRes, sentimientoRes] = await Promise.all([
      turso.execute('SELECT COUNT(*) AS total_usuarios FROM usuarios'),
      turso.execute("SELECT COUNT(*) AS usuarios_en_riesgo FROM usuarios WHERE estatus = 'en_riesgo'"),
      turso.execute('SELECT COUNT(*) AS total_interacciones FROM interacciones'),
      turso.execute('SELECT ROUND(AVG(sentimiento), 3) AS sentimiento_promedio FROM interacciones')
    ]);

    return res.status(200).json({
      kpis: {
        total_usuarios: usuariosRes.rows[0]?.total_usuarios || 0,
        usuarios_en_riesgo: riesgoRes.rows[0]?.usuarios_en_riesgo || 0,
        total_interacciones: interaccionesRes.rows[0]?.total_interacciones || 0,
        sentimiento_promedio: sentimientoRes.rows[0]?.sentimiento_promedio || 0
      }
    });
  } catch (error) {
    console.error('Error en GET /api/metricas/kpis:', error);
    return res.status(500).json({ error: 'Error al consultar KPIs' });
  }
});

/**
 * 7. GET /api/metricas/por-canal
 * Distribución de interacciones y sentimiento por canal / red social
 */
router.get('/por-canal', async (req, res) => {
  try {
    const resultado = await turso.execute(`
      SELECT 
        canal,
        COUNT(*) AS total_interacciones,
        ROUND(AVG(sentimiento), 3) AS sentimiento_medio
      FROM interacciones
      GROUP BY canal
      ORDER BY total_interacciones DESC
    `);

    return res.status(200).json({ canales: resultado.rows });
  } catch (error) {
    console.error('Error en GET /api/metricas/por-canal:', error);
    return res.status(500).json({ error: 'Error al consultar métricas por canal' });
  }
});

/**
 * 8. GET /api/metricas/mapa-calor
 * Matriz cruzada de Canal vs Tema (para mapa de calor analítico)
 */
router.get('/mapa-calor', async (req, res) => {
  try {
    const resultado = await turso.execute(`
      SELECT 
        canal,
        tema,
        COUNT(*) AS total
      FROM interacciones
      GROUP BY canal, tema
      ORDER BY canal, total DESC
    `);

    return res.status(200).json({ matriz: resultado.rows });
  } catch (error) {
    console.error('Error en GET /api/metricas/mapa-calor:', error);
    return res.status(500).json({ error: 'Error al generar mapa de calor' });
  }
});

/**
 * 9. GET /api/metricas/sentimiento-tiempo
 * Evolución cronológica del volumen y sentimiento promedio
 */
router.get('/sentimiento-tiempo', async (req, res) => {
  try {
    const resultado = await turso.execute(`
      SELECT 
        SUBSTR(timestamp, 1, 10) AS fecha,
        COUNT(*) AS total_interacciones,
        ROUND(AVG(sentimiento), 3) AS sentimiento_medio
      FROM interacciones
      GROUP BY fecha
      ORDER BY fecha ASC
    `);

    return res.status(200).json({ serie_temporal: resultado.rows });
  } catch (error) {
    console.error('Error en GET /api/metricas/sentimiento-tiempo:', error);
    return res.status(500).json({ error: 'Error al consultar serie temporal de sentimiento' });
  }
});

/**
 * 10. GET /api/metricas/geografia
 * Distribución por país y ciudad respetando la privacidad estricta
 * (sólo usuarios con consentimiento_datos = 'si')
 */
router.get('/geografia', async (req, res) => {
  try {
    const [paisesRes, ciudadesRes] = await Promise.all([
      turso.execute(`
        SELECT 
          p.nombre AS pais,
          COUNT(u.id_usuario) AS total_usuarios
        FROM usuarios u
        JOIN ciudades c ON c.id_ciudad = u.id_ciudad
        JOIN estados e  ON e.id_estado = c.id_estado
        JOIN paises p   ON p.id_pais   = e.id_pais
        WHERE u.consentimiento_datos = 'si'
        GROUP BY p.nombre
        ORDER BY total_usuarios DESC
      `),
      turso.execute(`
        SELECT 
          c.nombre AS ciudad,
          e.nombre AS estado,
          p.nombre AS pais,
          COUNT(u.id_usuario) AS total_usuarios
        FROM usuarios u
        JOIN ciudades c ON c.id_ciudad = u.id_ciudad
        JOIN estados e  ON e.id_estado = c.id_estado
        JOIN paises p   ON p.id_pais   = e.id_pais
        WHERE u.consentimiento_datos = 'si'
        GROUP BY c.nombre, e.nombre, p.nombre
        ORDER BY total_usuarios DESC
        LIMIT 10
      `)
    ]);

    return res.status(200).json({
      privacidad_garantizada: true,
      paises: paisesRes.rows,
      ciudades_top: ciudadesRes.rows
    });
  } catch (error) {
    console.error('Error en GET /api/metricas/geografia:', error);
    return res.status(500).json({ error: 'Error al consultar geografía' });
  }
});

/**
 * 11. GET /api/metricas/usuarios-en-riesgo
 * Miembros en riesgo de abandono con filtrado opcional por plataforma y nivel de prioridad
 */
router.get('/usuarios-en-riesgo', async (req, res) => {
  try {
    const { plataforma, prioridad } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const condiciones = ["u.estatus = 'en_riesgo'"];
    const args = [];

    if (plataforma) {
      condiciones.push('u.plataforma_principal = ?');
      args.push(String(plataforma).trim());
    }

    if (prioridad === 'alta') {
      condiciones.push('u.sentimiento_promedio <= -0.35');
    } else if (prioridad === 'seguimiento') {
      condiciones.push('u.sentimiento_promedio > -0.35');
    }

    const whereSql = `WHERE ${condiciones.join(' AND ')}`;

    const [resumenRes, resultado] = await Promise.all([
      turso.execute({
        sql: `
          SELECT
            COUNT(*) AS total_filtrados,
            ROUND(COALESCE(AVG(u.sentimiento_promedio), 0), 3) AS sentimiento_promedio,
            ROUND(COALESCE(AVG(u.mensajes_30d), 0), 1) AS mensajes_promedio_30d
          FROM usuarios u
          ${whereSql}
        `,
        args: [...args]
      }),
      turso.execute({
        sql: `
          SELECT 
            u.id_usuario,
            u.alias,
            u.plataforma_principal,
            u.mensajes_30d,
            u.reacciones_30d,
            u.sentimiento_promedio,
            u.ultima_actividad,
            u.estatus
          FROM usuarios u
          ${whereSql}
          ORDER BY u.sentimiento_promedio ASC, u.ultima_actividad ASC
          LIMIT ? OFFSET ?
        `,
        args: [...args, limit, offset]
      })
    ]);

    const rRow = resumenRes.rows[0] || {};

    return res.status(200).json({
      limit,
      offset,
      resumen: {
        total_filtrados: Number(rRow.total_filtrados || 0),
        sentimiento_promedio: Number(rRow.sentimiento_promedio || 0),
        mensajes_promedio_30d: Number(rRow.mensajes_promedio_30d || 0)
      },
      usuarios: resultado.rows
    });
  } catch (error) {
    console.error('Error en GET /api/metricas/usuarios-en-riesgo:', error);
    return res.status(500).json({ error: 'Error al consultar usuarios en riesgo' });
  }
});

/**
 * 12. GET /api/metricas/mapa-geografico
 * Coordenadas y teselas para el mapa de calor geográfico interactivo (MapTiler API + Leaflet Canvas)
 * Cumple privacidad estricta: solo usuarios con consentimiento_datos = 'si' y coordenadas válidas.
 */
router.get('/mapa-geografico', async (req, res) => {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), override: true });

    const rawKey = (process.env.MAPTILER_API_KEY || '').trim();
    const hasKey = Boolean(rawKey && rawKey !== 'pega_aqui_tu_maptiler_api_key');

    const fallbackDark = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const fallbackLight = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const tilesDark = hasKey
      ? `https://api.maptiler.com/maps/basic-v2-dark/256/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(rawKey)}`
      : fallbackDark;

    const tilesLight = hasKey
      ? `https://api.maptiler.com/maps/basic-v2/256/{z}/{x}/{y}@2x.png?key=${encodeURIComponent(rawKey)}`
      : fallbackLight;

    const attribution = hasKey
      ? '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
      : '&copy; OpenStreetMap &copy; CARTO';

    const [puntosRes, ciudadesRes] = await Promise.all([
      turso.execute(`
        SELECT
          ROUND(u.latitud, 3) AS lat,
          ROUND(u.longitud, 3) AS lng,
          u.sentimiento_promedio AS sentimiento
        FROM usuarios u
        WHERE u.consentimiento_datos = 'si'
          AND u.latitud IS NOT NULL
          AND u.longitud IS NOT NULL
      `),
      turso.execute(`
        SELECT
          c.nombre AS ciudad,
          e.nombre AS estado,
          p.nombre AS pais,
          ROUND(AVG(u.latitud), 4) AS lat,
          ROUND(AVG(u.longitud), 4) AS lng,
          COUNT(u.id_usuario) AS total_usuarios,
          ROUND(AVG(u.sentimiento_promedio), 3) AS sentimiento_promedio
        FROM usuarios u
        JOIN ciudades c ON c.id_ciudad = u.id_ciudad
        JOIN estados e  ON e.id_estado = c.id_estado
        JOIN paises p   ON p.id_pais   = e.id_pais
        WHERE u.consentimiento_datos = 'si'
          AND u.latitud IS NOT NULL
          AND u.longitud IS NOT NULL
        GROUP BY c.id_ciudad, c.nombre, e.nombre, p.nombre
        ORDER BY total_usuarios DESC
      `)
    ]);

    return res.status(200).json({
      privacidad_garantizada: true,
      mapa_config: {
        proveedor: hasKey ? 'MapTiler Cloud' : 'CartoDB Base',
        api_key_activa: hasKey,
        tiles_dark: tilesDark,
        tiles_light: tilesLight,
        fallback_dark: fallbackDark,
        fallback_light: fallbackLight,
        attribution
      },
      puntos: puntosRes.rows,
      ciudades: ciudadesRes.rows
    });
  } catch (error) {
    console.error('Error en GET /api/metricas/mapa-geografico:', error);
    return res.status(500).json({ error: 'Error al consultar coordenadas del mapa de calor' });
  }
});

module.exports = router;
