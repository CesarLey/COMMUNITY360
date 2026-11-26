'use strict';
const express = require('express');
const router = express.Router();
const turso = require('../db');
const { verificarAuth } = require('../middleware/auth');
const { notificarCambio } = require('../ws');

// Catálogos válidos según el esquema relacional
const CANALES = ['Telegram', 'Facebook', 'Instagram', 'TikTok', 'Twitter/X', 'Discord'];
const TIPOS = ['mensaje', 'comentario', 'reaccion', 'respuesta_encuesta', 'rsvp_evento'];
const TEMAS = ['arte_comisiones', 'reglas_moderacion', 'eventos_convenciones', 'videojuegos',
               'memes_humor', 'fursuits', 'seguridad_privacidad', 'musica'];

// Proteger todas las rutas de interacciones con autenticación JWT
router.use(verificarAuth);

/**
 * 1. GET /api/interacciones
 * Consulta interacciones con paginación y filtros opcionales (canal, tema, tipo)
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { canal, tema, tipo } = req.query;

    const condiciones = [];
    const args = [];

    if (canal) {
      condiciones.push('i.canal = ?');
      args.push(canal);
    }
    if (tema) {
      condiciones.push('i.tema = ?');
      args.push(tema);
    }
    if (tipo) {
      condiciones.push('i.tipo = ?');
      args.push(tipo);
    }

    const whereClause = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    // Métricas agregadas del segmento filtrado
    const statsRes = await turso.execute({
      sql: `
        SELECT
          COUNT(*) AS total,
          ROUND(COALESCE(AVG(i.sentimiento), 0), 3) AS sentimiento_promedio,
          COALESCE(SUM(i.reacciones_recibidas), 0) AS total_reacciones,
          ROUND(COALESCE(AVG(i.reacciones_recibidas), 0), 1) AS promedio_reacciones
        FROM interacciones i
        ${whereClause}
      `,
      args: [...args]
    });
    const statsRow = statsRes.rows[0] || {};
    const total = Number(statsRow.total || 0);

    // Registros
    const sql = `
      SELECT 
        i.id_interaccion,
        i.id_usuario,
        u.alias,
        i.timestamp,
        i.canal,
        i.tipo,
        i.texto,
        i.tema,
        i.sentimiento,
        i.idioma,
        i.dispositivo,
        i.longitud_texto,
        i.reacciones_recibidas,
        GROUP_CONCAT(ie.etiqueta, ', ') AS etiquetas
      FROM interacciones i
      LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
      LEFT JOIN interaccion_etiqueta ie ON ie.id_interaccion = i.id_interaccion
      ${whereClause}
      GROUP BY i.id_interaccion
      ORDER BY i.timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const resultado = await turso.execute({
      sql,
      args: [...args, limit, offset]
    });

    const interacciones = resultado.rows.map(row => ({
      ...row,
      etiquetas: row.etiquetas ? row.etiquetas.split(', ') : []
    }));

    return res.status(200).json({
      total,
      limit,
      offset,
      resumen_segmento: {
        total_interacciones: total,
        sentimiento_promedio: Number(statsRow.sentimiento_promedio || 0),
        total_reacciones: Number(statsRow.total_reacciones || 0),
        promedio_reacciones: Number(statsRow.promedio_reacciones || 0)
      },
      interacciones
    });
  } catch (error) {
    console.error('Error en GET /api/interacciones:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'No fue posible obtener las interacciones.'
    });
  }
});

/**
 * 2. GET /api/interacciones/:id
 * Detalle completo de una interacción con datos del usuario autor
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        i.id_interaccion,
        i.id_usuario,
        u.alias,
        u.rango_edad,
        u.estatus AS estatus_usuario,
        i.timestamp,
        i.canal,
        i.tipo,
        i.texto,
        i.tema,
        i.sentimiento,
        i.idioma,
        i.dispositivo,
        i.longitud_texto,
        i.reacciones_recibidas
      FROM interacciones i
      LEFT JOIN usuarios u ON u.id_usuario = i.id_usuario
      WHERE i.id_interaccion = ?
      LIMIT 1
    `;

    const resultado = await turso.execute({ sql, args: [id] });

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        error: 'No encontrada',
        mensaje: `La interacción ${id} no existe en la base de datos.`
      });
    }

    const interaccion = resultado.rows[0];

    // Obtener etiquetas
    const tagsRes = await turso.execute({
      sql: `SELECT etiqueta FROM interaccion_etiqueta WHERE id_interaccion = ?`,
      args: [id]
    });
    interaccion.etiquetas = tagsRes.rows.map(r => r.etiqueta);

    return res.status(200).json({ interaccion });
  } catch (error) {
    console.error(`Error en GET /api/interacciones/${req.params.id}:`, error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'Error al consultar el detalle de la interacción.'
    });
  }
});

/**
 * 3. POST /api/interacciones
 * Crea una nueva interacción asegurando integridad referencial con usuarios
 */
router.post('/', async (req, res) => {
  try {
    let {
      id_interaccion,
      id_usuario,
      timestamp,
      canal,
      tipo,
      texto,
      tema,
      sentimiento,
      idioma,
      dispositivo,
      reacciones_recibidas,
      etiquetas
    } = req.body;

    // Validar id_usuario obligatorio
    if (!id_usuario || typeof id_usuario !== 'string') {
      return res.status(400).json({
        error: 'Validación fallida',
        mensaje: 'El campo id_usuario es obligatorio.'
      });
    }

    // Verificar integridad referencial: el usuario debe existir en Turso
    const userCheck = await turso.execute({
      sql: 'SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
      args: [id_usuario.trim()]
    });

    if (userCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'Integridad referencial violada',
        mensaje: `El usuario ${id_usuario} no existe en el padrón de la comunidad.`
      });
    }

    // Generar id_interaccion si no se proporciona (formato I0000000)
    if (!id_interaccion) {
      const maxIdRes = await turso.execute(`
        SELECT MAX(CAST(SUBSTR(id_interaccion, 2) AS INTEGER)) AS max_id 
        FROM interacciones
      `);
      const siguienteNum = (maxIdRes.rows[0]?.max_id || 0) + 1;
      id_interaccion = `I${String(siguienteNum).padStart(7, '0')}`;
    } else {
      if (!/^I\d{7}$/.test(id_interaccion)) {
        return res.status(400).json({
          error: 'Formato inválido',
          mensaje: 'El id_interaccion debe cumplir el formato I seguido de 7 dígitos (ej: I0000001).'
        });
      }
    }

    // Validar timestamp o asignar actual en ISO UTC
    if (!timestamp) {
      timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    // Validar pertenencia a catálogos
    if (!canal || !CANALES.includes(canal)) {
      return res.status(400).json({
        error: 'Canal inválido',
        mensaje: `El canal debe ser uno de: ${CANALES.join(', ')}.`
      });
    }

    if (!tipo || !TIPOS.includes(tipo)) {
      return res.status(400).json({
        error: 'Tipo inválido',
        mensaje: `El tipo debe ser uno de: ${TIPOS.join(', ')}.`
      });
    }

    if (!tema || !TEMAS.includes(tema)) {
      return res.status(400).json({
        error: 'Tema inválido',
        mensaje: `El tema debe ser uno de: ${TEMAS.join(', ')}.`
      });
    }

    // Validar sentimiento (-1 a 1)
    const sentNum = Number(sentimiento);
    if (isNaN(sentNum) || sentNum < -1 || sentNum > 1) {
      return res.status(400).json({
        error: 'Sentimiento fuera de rango',
        mensaje: 'El sentimiento debe ser un número decimal entre -1.0 y 1.0.'
      });
    }

    const textoFinal = texto ? String(texto).trim() : null;
    const longitud_texto = textoFinal ? textoFinal.length : 0;
    const reaccNum = Math.max(parseInt(reacciones_recibidas, 10) || 0, 0);

    // Inserción en Turso
    await turso.execute({
      sql: `
        INSERT INTO interacciones (
          id_interaccion, id_usuario, timestamp, canal, tipo, texto,
          tema, sentimiento, idioma, dispositivo, longitud_texto, reacciones_recibidas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id_interaccion,
        id_usuario.trim(),
        timestamp,
        canal,
        tipo,
        textoFinal,
        tema,
        sentNum,
        idioma ? String(idioma).toLowerCase() : null,
        dispositivo || null,
        longitud_texto,
        reaccNum
      ]
    });

    // Guardar etiquetas si vienen presentes
    const tagsGuardadas = [];
    if (Array.isArray(etiquetas) && etiquetas.length > 0) {
      const tagsLimpias = [...new Set(etiquetas.map(t => String(t).trim().toLowerCase()).filter(Boolean))];
      for (const t of tagsLimpias) {
        await turso.execute({
          sql: `INSERT OR IGNORE INTO interaccion_etiqueta (id_interaccion, etiqueta) VALUES (?, ?)`,
          args: [id_interaccion, t]
        });
        tagsGuardadas.push(t);
      }
    }

    const nuevaInteraccion = {
      id_interaccion,
      id_usuario: id_usuario.trim(),
      timestamp,
      canal,
      tipo,
      texto: textoFinal,
      tema,
      sentimiento: sentNum,
      idioma: idioma || null,
      dispositivo: dispositivo || null,
      longitud_texto,
      reacciones_recibidas: reaccNum,
      etiquetas: tagsGuardadas
    };

    // Notificar en tiempo real mediante WebSocket a todos los dashboards conectados
    notificarCambio('INTERACCION_CREADA', {
      operacion: 'POST',
      interaccion: nuevaInteraccion
    });

    return res.status(201).json({
      mensaje: 'Interacción creada exitosamente',
      interaccion: nuevaInteraccion
    });

  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        error: 'Conflicto',
        mensaje: 'Ya existe una interacción con ese identificador.'
      });
    }
    console.error('Error en POST /api/interacciones:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'No fue posible crear la interacción.'
    });
  }
});

/**
 * 4. PUT /api/interacciones/:id
 * Actualiza los campos modificables de una interacción
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { canal, tipo, texto, tema, sentimiento, idioma, dispositivo, reacciones_recibidas, etiquetas } = req.body;

    // Verificar existencia
    const existe = await turso.execute({
      sql: 'SELECT id_interaccion FROM interacciones WHERE id_interaccion = ?',
      args: [id]
    });

    if (existe.rows.length === 0) {
      return res.status(404).json({
        error: 'No encontrada',
        mensaje: `La interacción ${id} no existe.`
      });
    }

    const updates = [];
    const args = [];

    if (canal !== undefined) {
      if (!CANALES.includes(canal)) {
        return res.status(400).json({ error: 'Canal inválido', mensaje: `Opciones: ${CANALES.join(', ')}` });
      }
      updates.push('canal = ?');
      args.push(canal);
    }

    if (tipo !== undefined) {
      if (!TIPOS.includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido', mensaje: `Opciones: ${TIPOS.join(', ')}` });
      }
      updates.push('tipo = ?');
      args.push(tipo);
    }

    if (tema !== undefined) {
      if (!TEMAS.includes(tema)) {
        return res.status(400).json({ error: 'Tema inválido', mensaje: `Opciones: ${TEMAS.join(', ')}` });
      }
      updates.push('tema = ?');
      args.push(tema);
    }

    if (sentimiento !== undefined) {
      const s = Number(sentimiento);
      if (isNaN(s) || s < -1 || s > 1) {
        return res.status(400).json({ error: 'Sentimiento inválido', mensaje: 'Debe ser entre -1 y 1.' });
      }
      updates.push('sentimiento = ?');
      args.push(s);
    }

    if (texto !== undefined) {
      const textoFinal = texto ? String(texto).trim() : null;
      updates.push('texto = ?');
      args.push(textoFinal);
      updates.push('longitud_texto = ?');
      args.push(textoFinal ? textoFinal.length : 0);
    }

    if (idioma !== undefined) {
      updates.push('idioma = ?');
      args.push(idioma ? String(idioma).toLowerCase() : null);
    }

    if (dispositivo !== undefined) {
      updates.push('dispositivo = ?');
      args.push(dispositivo || null);
    }

    if (reacciones_recibidas !== undefined) {
      updates.push('reacciones_recibidas = ?');
      args.push(Math.max(parseInt(reacciones_recibidas, 10) || 0, 0));
    }

    if (updates.length > 0) {
      args.push(id);
      await turso.execute({
        sql: `UPDATE interacciones SET ${updates.join(', ')} WHERE id_interaccion = ?`,
        args
      });
    }

    // Actualizar etiquetas si se proporcionaron
    if (Array.isArray(etiquetas)) {
      await turso.execute({
        sql: 'DELETE FROM interaccion_etiqueta WHERE id_interaccion = ?',
        args: [id]
      });
      const tagsLimpias = [...new Set(etiquetas.map(t => String(t).trim().toLowerCase()).filter(Boolean))];
      for (const t of tagsLimpias) {
        await turso.execute({
          sql: 'INSERT OR IGNORE INTO interaccion_etiqueta (id_interaccion, etiqueta) VALUES (?, ?)',
          args: [id, t]
        });
      }
    }

    // Notificar en tiempo real mediante WebSocket a todos los dashboards conectados
    notificarCambio('INTERACCION_ACTUALIZADA', {
      operacion: 'PUT',
      id_interaccion: id,
      cambios: req.body
    });

    return res.status(200).json({
      mensaje: `Interacción ${id} actualizada exitosamente`
    });

  } catch (error) {
    console.error(`Error en PUT /api/interacciones/${req.params.id}:`, error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'No fue posible actualizar la interacción.'
    });
  }
});

/**
 * 5. DELETE /api/interacciones/:id
 * Elimina una interacción de Turso y sus etiquetas asociadas
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existe = await turso.execute({
      sql: 'SELECT id_interaccion FROM interacciones WHERE id_interaccion = ?',
      args: [id]
    });

    if (existe.rows.length === 0) {
      return res.status(404).json({
        error: 'No encontrada',
        mensaje: `La interacción ${id} no existe.`
      });
    }

    // En schema.sql, interaccion_etiqueta tiene ON DELETE CASCADE, pero aseguramos la limpieza
    await turso.execute({
      sql: 'DELETE FROM interaccion_etiqueta WHERE id_interaccion = ?',
      args: [id]
    });

    await turso.execute({
      sql: 'DELETE FROM interacciones WHERE id_interaccion = ?',
      args: [id]
    });

    // Notificar en tiempo real mediante WebSocket a todos los dashboards conectados
    notificarCambio('INTERACCION_ELIMINADA', {
      operacion: 'DELETE',
      id_interaccion: id
    });

    return res.status(200).json({
      mensaje: `Interacción ${id} eliminada exitosamente.`
    });

  } catch (error) {
    console.error(`Error en DELETE /api/interacciones/${req.params.id}:`, error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      mensaje: 'No fue posible eliminar la interacción.'
    });
  }
});

module.exports = router;
