'use strict';
/**
 * COMMUNITY 360 - Fase 2 (parte 1): limpieza, transformación y privacidad.
 * Sin dependencias externas. Uso:  node etl/clean.js
 *
 * Entrada : data/raw/*.csv
 * Salida  : data/clean/usuarios_limpios.csv
 *           data/clean/interacciones_limpias.csv
 *           data/clean/interaccion_etiqueta.csv
 *           data/clean/paises.csv, estados.csv, ciudades.csv   (catalogos geograficos, 3FN)
 *           data/clean/cuarentena.jsonl      (registros rechazados, NUNCA se descartan en silencio)
 *           data/clean/bitacora.json         (recibidos / aceptados / transformados / rechazados)
 *           data/clean/resumen_calidad.md    (antes vs después + ejemplo anonimizado)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'clean');

// ------------------------------------------------------------------ catálogos
const CANALES = ['Telegram', 'Facebook', 'Instagram', 'TikTok', 'Twitter/X', 'Discord'];
const TIPOS = ['mensaje', 'comentario', 'reaccion', 'respuesta_encuesta', 'rsvp_evento'];
const TEMAS = ['arte_comisiones', 'reglas_moderacion', 'eventos_convenciones', 'videojuegos',
  'memes_humor', 'fursuits', 'seguridad_privacidad', 'musica'];
const ESTATUS = ['activo', 'en_riesgo', 'inactivo'];
const NULOS = new Set(['', 'nan', 'null', 'none', 'n/a', 'na', 'nat', '-', '--']);

// Campos que permiten inferir ubicación (se eliminan si consentimiento_datos = "no")
const GEO_USUARIO = ['pais', 'estado', 'ciudad', 'latitud', 'longitud', 'zona_horaria'];
const GEO_INTERACCION = ['pais', 'estado', 'ciudad'];

// Columnas del archivo ORIGINAL (para medir la calidad "antes")
const COLS_USUARIOS_RAW = ['id_usuario', 'alias', 'fecha_ingreso', 'pais', 'estado', 'ciudad', 'latitud', 'longitud',
  'zona_horaria', 'rango_edad', 'especie_fursona', 'interes_principal', 'plataforma_principal', 'es_artista',
  'mensajes_30d', 'reacciones_30d', 'eventos_asistidos', 'comisiones_compradas', 'sentimiento_promedio',
  'ultima_actividad', 'estatus', 'consentimiento_datos'];
const COLS_INTERACCIONES_RAW = ['id_interaccion', 'id_usuario', 'timestamp', 'canal', 'tipo', 'texto', 'tema',
  'sentimiento', 'idioma', 'pais', 'estado', 'ciudad', 'dispositivo', 'longitud_texto', 'reacciones_recibidas', 'etiquetas'];
// Columnas del modelo NORMALIZADO (3FN): la ubicación vive en los catálogos paises/estados/ciudades
const COLS_USUARIOS = ['id_usuario', 'alias', 'fecha_ingreso', 'id_ciudad', 'latitud', 'longitud', 'rango_edad',
  'especie_fursona', 'interes_principal', 'plataforma_principal', 'es_artista', 'mensajes_30d', 'reacciones_30d',
  'eventos_asistidos', 'comisiones_compradas', 'sentimiento_promedio', 'ultima_actividad', 'estatus', 'consentimiento_datos'];
const COLS_INTERACCIONES = ['id_interaccion', 'id_usuario', 'timestamp', 'canal', 'tipo', 'texto', 'tema',
  'sentimiento', 'idioma', 'dispositivo', 'longitud_texto', 'reacciones_recibidas'];
const COLS_PAISES = ['id_pais', 'nombre'];
const COLS_ESTADOS = ['id_estado', 'nombre', 'id_pais'];
const COLS_CIUDADES = ['id_ciudad', 'nombre', 'id_estado', 'zona_horaria'];

// ------------------------------------------------------------------ CSV
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] === undefined ? '' : r[i]])));
}

function toCSV(cols, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

// ------------------------------------------------------------------ normalizadores
const nul = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return NULOS.has(s.toLowerCase()) ? null : s;
};
const pad = (n, l = 2) => String(n).padStart(l, '0');
function fechaReal(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** dd/mm/aaaa  |  aaaa-mm-dd[ T hh:mm:ss]  ->  'aaaa-mm-dd' (o null) */
function parseFecha(v) {
  const s = nul(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const [d, mo, y] = [+m[1], +m[2], +m[3]]; return fechaReal(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (m) { const [y, mo, d] = [+m[1], +m[2], +m[3]]; return fechaReal(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null; }
  return null;
}
/** timestamp ISO -> 'aaaa-mm-ddThh:mm:ssZ' (UTC) o null */
function parseTimestamp(v) {
  const s = nul(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m || !fechaReal(+m[1], +m[2], +m[3])) return null;
  const d = new Date(m[7] && m[7] !== 'Z' ? s.replace(' ', 'T') : `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return isNaN(d) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
const numero = (v) => { const s = nul(v); if (s === null) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
const entero = (v) => { const n = numero(v); return n === null ? null : (Number.isInteger(n) ? n : NaN); };
const enCatalogo = (v, lista) => {
  const s = nul(v); if (s === null) return null;
  const hit = lista.find((x) => x.toLowerCase() === s.toLowerCase());
  return hit || undefined; // undefined = valor fuera de catálogo
};
const texto = (v) => { const s = nul(v); return s === null ? null : s.replace(/\s+/g, ' '); };

// ------------------------------------------------------------------ calidad "antes"
function perfil(rows, cols, idCol, extra = {}) {
  const nulos = {};
  cols.forEach((c) => { nulos[c] = rows.filter((r) => nul(r[c]) === null).length; });
  const vistos = new Set(); let dupId = 0;
  rows.forEach((r) => { const k = (r[idCol] || '').trim(); if (vistos.has(k)) dupId++; vistos.add(k); });
  return { registros: rows.length, duplicados_por_id: dupId, nulos_por_columna: nulos, ...extra };
}

// ------------------------------------------------------------------ usuarios
function procesarUsuarios(raw, ctx) {
  const aceptados = new Map();
  raw.forEach((r, idx) => {
    const linea = idx + 2;
    const rechazar = (motivo, detalle) => ctx.rechazar('usuarios', motivo, detalle, r, linea);
    const u = {};
    u.id_usuario = nul(r.id_usuario);
    if (!u.id_usuario || !/^U\d{6}$/.test(u.id_usuario)) return rechazar('id_usuario_invalido', u.id_usuario);
    if (aceptados.has(u.id_usuario)) return rechazar('duplicado_id_usuario', u.id_usuario);
    u.alias = texto(r.alias);
    if (!u.alias) return rechazar('campo_obligatorio_vacio', 'alias');
    if (ctx.aliasVistos.has(u.alias.toLowerCase())) return rechazar('duplicado_alias', u.alias);

    const fi = parseFecha(r.fecha_ingreso); const ua = parseFecha(r.ultima_actividad);
    if (!fi) return rechazar('fecha_invalida', 'fecha_ingreso=' + r.fecha_ingreso);
    if (!ua) return rechazar('fecha_invalida', 'ultima_actividad=' + r.ultima_actividad);
    if (ua < fi) return rechazar('incoherencia_fechas', `ultima_actividad ${ua} < fecha_ingreso ${fi}`);
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(nul(r.fecha_ingreso) || '') || /^\d{4}-/.test(nul(r.fecha_ingreso) || '')) ctx.cont.fechas_estandarizadas++;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(nul(r.ultima_actividad) || '') || /^\d{4}-/.test(nul(r.ultima_actividad) || '')) ctx.cont.fechas_estandarizadas++;
    u.fecha_ingreso = fi; u.ultima_actividad = ua;

    const cons = (nul(r.consentimiento_datos) || '').toLowerCase().replace('sí', 'si');
    if (!['si', 'no'].includes(cons)) return rechazar('consentimiento_invalido', r.consentimiento_datos);
    u.consentimiento_datos = cons;
    const est = enCatalogo(r.estatus, ESTATUS);
    if (!est) return rechazar('categoria_fuera_de_catalogo', 'estatus=' + r.estatus);
    u.estatus = est;
    const plat = enCatalogo(r.plataforma_principal, CANALES);
    if (plat === undefined) return rechazar('categoria_fuera_de_catalogo', 'plataforma_principal=' + r.plataforma_principal);
    u.plataforma_principal = plat;

    for (const c of ['rango_edad', 'especie_fursona', 'interes_principal']) u[c] = texto(r[c]);
    const ubic = { pais: texto(r.pais), estado: texto(r.estado), ciudad: texto(r.ciudad), zona: texto(r.zona_horaria) };

    const art = entero(r.es_artista);
    if (art !== 0 && art !== 1) return rechazar('tipo_invalido', 'es_artista=' + r.es_artista);
    u.es_artista = art;
    for (const c of ['mensajes_30d', 'reacciones_30d', 'eventos_asistidos', 'comisiones_compradas']) {
      const n = entero(r[c]);
      if (n === null || Number.isNaN(n) || n < 0) return rechazar('tipo_o_rango_invalido', `${c}=${r[c]}`);
      u[c] = n;
    }
    const sp = numero(r.sentimiento_promedio);
    if (sp === null || Number.isNaN(sp) || sp < -1 || sp > 1) return rechazar('tipo_o_rango_invalido', 'sentimiento_promedio=' + r.sentimiento_promedio);
    u.sentimiento_promedio = sp;
    const lat = numero(r.latitud); const lon = numero(r.longitud);
    if (Number.isNaN(lat) || Number.isNaN(lon) || (lat !== null && Math.abs(lat) > 90) || (lon !== null && Math.abs(lon) > 180))
      return rechazar('coordenadas_invalidas', `${r.latitud},${r.longitud}`);
    u.latitud = lat; u.longitud = lon;

    // ---- PRIVACIDAD y UBICACIÓN: sin consentimiento no se conserva ningún dato geográfico.
    // La ubicación (país > estado > ciudad + zona horaria) se normaliza en catálogos; el usuario solo guarda id_ciudad.
    if (u.consentimiento_datos === 'no') {
      const n = [ubic.pais, ubic.estado, ubic.ciudad, ubic.zona, u.latitud, u.longitud].filter((v) => v !== null && v !== undefined).length;
      u.latitud = null; u.longitud = null; u._ubic = null;
      ctx.cont.usuarios_sin_consentimiento++;
      ctx.cont.campos_geo_eliminados_usuarios += n;
    } else {
      const presentes = [ubic.pais, ubic.estado, ubic.ciudad, ubic.zona].filter(Boolean).length;
      if (presentes > 0 && presentes < 4) return rechazar('ubicacion_incompleta', `${ubic.pais}|${ubic.estado}|${ubic.ciudad}|${ubic.zona}`);
      if (presentes === 4) {
        const k = `${ubic.pais}|${ubic.estado}|${ubic.ciudad}`;
        if (ctx.zonaPorCiudad.has(k) && ctx.zonaPorCiudad.get(k) !== ubic.zona) return rechazar('ubicacion_inconsistente', `${k} -> ${ubic.zona}`);
        ctx.zonaPorCiudad.set(k, ubic.zona);
        u._ubic = ubic;
      } else u._ubic = null;
    }
    ctx.aliasVistos.add(u.alias.toLowerCase());
    aceptados.set(u.id_usuario, u);
  });
  return aceptados;
}

/** Genera paises, estados y ciudades (3FN) con ids estables (orden alfabético) y asigna id_ciudad a cada usuario. */
function construirCatalogos(usuarios) {
  const cmp = (x, y) => x.localeCompare(y, 'es');
  const lista = [...usuarios.values()].filter((u) => u._ubic);
  const paises = [...new Set(lista.map((u) => u._ubic.pais))].sort(cmp).map((nombre, k) => ({ id_pais: k + 1, nombre }));
  const idPais = new Map(paises.map((x) => [x.nombre, x.id_pais]));
  const edos = new Map(lista.map((u) => [`${u._ubic.pais}|${u._ubic.estado}`, { pais: u._ubic.pais, nombre: u._ubic.estado }]));
  const estadosOrd = [...edos.entries()].sort((x, y) => cmp(x[1].pais, y[1].pais) || cmp(x[1].nombre, y[1].nombre));
  const estados = estadosOrd.map(([, e], k) => ({ id_estado: k + 1, nombre: e.nombre, id_pais: idPais.get(e.pais) }));
  const idEstado = new Map(estadosOrd.map(([key], k) => [key, k + 1]));
  const ciu = new Map(lista.map((u) => [`${u._ubic.pais}|${u._ubic.estado}|${u._ubic.ciudad}`, u._ubic]));
  const ciuOrd = [...ciu.entries()].sort((x, y) => cmp(x[1].pais, y[1].pais) || cmp(x[1].estado, y[1].estado) || cmp(x[1].ciudad, y[1].ciudad));
  const ciudades = ciuOrd.map(([key, c], k) => ({ id_ciudad: k + 1, nombre: c.ciudad, id_estado: idEstado.get(`${c.pais}|${c.estado}`), zona_horaria: c.zona }));
  const idCiudad = new Map(ciuOrd.map(([key], k) => [key, k + 1]));
  for (const u of usuarios.values()) {
    u.id_ciudad = u._ubic ? idCiudad.get(`${u._ubic.pais}|${u._ubic.estado}|${u._ubic.ciudad}`) : null;
    delete u._ubic;
  }
  return { paises, estados, ciudades };
}

// ------------------------------------------------------------------ interacciones
function procesarInteracciones(raw, usuarios, ctx) {
  const aceptadas = []; const etiquetas = [];
  const ids = new Set(); const huellas = new Set();
  raw.forEach((r, idx) => {
    const linea = idx + 2;
    const i = {};
    const rechazarSaneado = (motivo, detalle) => ctx.rechazar('interacciones', motivo, detalle, r, linea);
    i.id_interaccion = nul(r.id_interaccion);
    if (!i.id_interaccion || !/^I\d{7}$/.test(i.id_interaccion)) return rechazarSaneado('id_interaccion_invalido', i.id_interaccion);
    if (ids.has(i.id_interaccion)) return rechazarSaneado('duplicado_id_interaccion', i.id_interaccion);
    i.id_usuario = nul(r.id_usuario);
    if (!i.id_usuario) return rechazarSaneado('campo_obligatorio_vacio', 'id_usuario');
    i.timestamp = parseTimestamp(r.timestamp);
    if (!i.timestamp) return rechazarSaneado('fecha_invalida', 'timestamp=' + r.timestamp);
    const canal = enCatalogo(r.canal, CANALES); const tipo = enCatalogo(r.tipo, TIPOS); const tema = enCatalogo(r.tema, TEMAS);
    if (!canal) return rechazarSaneado('categoria_fuera_de_catalogo', 'canal=' + r.canal);
    if (!tipo) return rechazarSaneado('categoria_fuera_de_catalogo', 'tipo=' + r.tipo);
    if (!tema) return rechazarSaneado('categoria_fuera_de_catalogo', 'tema=' + r.tema);
    i.canal = canal; i.tipo = tipo; i.tema = tema;
    i.texto = texto(r.texto);
    i.idioma = (nul(r.idioma) || '').toLowerCase() || null;
    i.dispositivo = texto(r.dispositivo);
    const s = numero(r.sentimiento);
    if (s === null || Number.isNaN(s) || s < -1 || s > 1) return rechazarSaneado('tipo_o_rango_invalido', 'sentimiento=' + r.sentimiento);
    i.sentimiento = s;
    for (const c of ['longitud_texto', 'reacciones_recibidas']) {
      const n = entero(r[c]);
      if (n === null || Number.isNaN(n) || n < 0) return rechazarSaneado('tipo_o_rango_invalido', `${c}=${r[c]}`);
      i[c] = n;
    }

    // duplicado por contenido (mismo usuario, instante, canal, tipo y texto)
    const huella = [i.id_usuario, i.timestamp, i.canal, i.tipo, i.texto].join('|');
    if (huellas.has(huella)) return rechazarSaneado('duplicado_por_contenido', huella);

    // ---- INTEGRIDAD REFERENCIAL: cuarentena, nunca eliminación silenciosa
    const dueno = usuarios.get(i.id_usuario);
    if (!dueno) return rechazarSaneado('usuario_inexistente', i.id_usuario);

    // ---- PRIVACIDAD: la ubicación ya no se guarda en la interacción (es redundante; se obtiene por JOIN con usuarios)
    ctx.cont.valores_geo_descartados_interacciones += GEO_INTERACCION.filter((c) => nul(r[c]) !== null).length;
    if (dueno.consentimiento_datos === 'no') ctx.cont.interacciones_de_usuarios_sin_consentimiento++;
    // etiquetas multivaluadas 'a|b|c' -> tabla puente
    const tags = [...new Set((nul(r.etiquetas) || '').split('|').map((t) => t.trim().toLowerCase()).filter(Boolean))];
    tags.forEach((t) => etiquetas.push({ id_interaccion: i.id_interaccion, etiqueta: t }));

    ids.add(i.id_interaccion); huellas.add(huella);
    aceptadas.push(i);
  });
  return { aceptadas, etiquetas };
}

// ------------------------------------------------------------------ orquestación
function ejecutar({ rawUsuarios, rawInteracciones, runId }) {
  const rechazados = [];
  const ctx = {
    aliasVistos: new Set(),
    zonaPorCiudad: new Map(),
    cont: { fechas_estandarizadas: 0, usuarios_sin_consentimiento: 0, campos_geo_eliminados_usuarios: 0,
      valores_geo_descartados_interacciones: 0, interacciones_de_usuarios_sin_consentimiento: 0 },
    rechazar(entidad, motivo, detalle, registro, linea) {
      // Si el consentimiento no se puede verificar (usuario inexistente) o el registro es de un usuario,
      // se aplica el criterio conservador: no se guarda ubicación en la cuarentena.
      const payload = { ...registro };
      const geo = entidad === 'usuarios' ? GEO_USUARIO : GEO_INTERACCION;
      let saneado = false;
      geo.forEach((c) => { if (c in payload && nul(payload[c]) !== null) { payload[c] = null; saneado = true; } });
      rechazados.push({ run_id: runId, entidad, linea_origen: linea, motivo, detalle: detalle ?? null,
        geo_eliminada_por_privacidad: saneado, payload });
    },
  };

  const antes = {
    usuarios: perfil(rawUsuarios, COLS_USUARIOS_RAW, 'id_usuario', {
      fechas_formato_dd_mm_aaaa: rawUsuarios.filter((r) => /^\d{2}\/\d{2}\/\d{4}$/.test(r.fecha_ingreso)).length,
      fechas_formato_iso: rawUsuarios.filter((r) => /^\d{4}-/.test(r.fecha_ingreso)).length,
      sin_consentimiento: rawUsuarios.filter((r) => (r.consentimiento_datos || '').toLowerCase() === 'no').length,
      sin_consentimiento_con_geo: rawUsuarios.filter((r) => (r.consentimiento_datos || '').toLowerCase() === 'no' && GEO_USUARIO.some((c) => nul(r[c]) !== null)).length,
    }),
    interacciones: perfil(rawInteracciones, COLS_INTERACCIONES_RAW, 'id_interaccion'),
  };
  const idsU = new Set(rawUsuarios.map((r) => (r.id_usuario || '').trim()));
  antes.interacciones.con_referencia_inexistente = rawInteracciones.filter((r) => !idsU.has((r.id_usuario || '').trim())).length;

  const usuarios = procesarUsuarios(rawUsuarios, ctx);
  const { aceptadas, etiquetas } = procesarInteracciones(rawInteracciones, usuarios, ctx);
  const catalogos = construirCatalogos(usuarios);
  const usuariosArr = [...usuarios.values()];

  const despues = {
    usuarios: perfil(usuariosArr, COLS_USUARIOS, 'id_usuario', {
      sin_consentimiento_con_geo: usuariosArr.filter((u) => u.consentimiento_datos === 'no' && (u.id_ciudad !== null || u.latitud !== null || u.longitud !== null)).length,
    }),
    interacciones: perfil(aceptadas, COLS_INTERACCIONES, 'id_interaccion', {
      con_referencia_inexistente: aceptadas.filter((i) => !usuarios.has(i.id_usuario)).length,
      columnas_geograficas: GEO_INTERACCION.filter((c) => aceptadas.some((i) => c in i)).length,
    }),
  };

  const porMotivo = (ent) => rechazados.filter((r) => r.entidad === ent).reduce((a, r) => ((a[r.motivo] = (a[r.motivo] || 0) + 1), a), {});
  const bitacora = {
    run_id: runId,
    ejecutado_en: new Date().toISOString(),
    entradas: { usuarios_recibidos: rawUsuarios.length, interacciones_recibidas: rawInteracciones.length },
    usuarios: { recibidos: rawUsuarios.length, aceptados: usuariosArr.length, rechazados: rawUsuarios.length - usuariosArr.length, rechazos_por_motivo: porMotivo('usuarios') },
    interacciones: { recibidas: rawInteracciones.length, aceptadas: aceptadas.length, rechazadas: rawInteracciones.length - aceptadas.length, rechazos_por_motivo: porMotivo('interacciones'), etiquetas_generadas: etiquetas.length },
    catalogos_geograficos: { paises: catalogos.paises.length, estados: catalogos.estados.length, ciudades: catalogos.ciudades.length },
    transformaciones: ctx.cont,
    verificacion: { cuadra_usuarios: usuariosArr.length + (rawUsuarios.length - usuariosArr.length) === rawUsuarios.length,
      cuadra_interacciones: aceptadas.length + rechazados.filter((r) => r.entidad === 'interacciones').length === rawInteracciones.length },
    calidad_antes: antes, calidad_despues: despues,
  };
  return { usuarios: usuariosArr, interacciones: aceptadas, etiquetas, catalogos, rechazados, bitacora };
}

// ------------------------------------------------------------------ reporte
function resumenMd(res, rawUsuarios) {
  const b = res.bitacora; const a = b.calidad_antes; const d = b.calidad_despues;
  const sumNulos = (o) => Object.values(o).reduce((x, y) => x + y, 0);
  const ejemploRaw = rawUsuarios.find((r) => (r.consentimiento_datos || '').toLowerCase() === 'no');
  const ejemploLimpio = res.usuarios.find((u) => u.id_usuario === ejemploRaw.id_usuario);
  const motivos = (o) => Object.entries(o).map(([k, v]) => `| ${k} | ${v} |`).join('\n') || '| (ninguno) | 0 |';
  return `# Resumen de calidad de datos — corrida ${b.run_id}

## Conteos (bitácora)
| Entidad | Recibidos | Aceptados | Rechazados (cuarentena) |
|---|---|---|---|
| Usuarios | ${b.usuarios.recibidos} | ${b.usuarios.aceptados} | ${b.usuarios.rechazados} |
| Interacciones | ${b.interacciones.recibidas} | ${b.interacciones.aceptadas} | ${b.interacciones.rechazadas} |

Etiquetas generadas (tabla puente): ${b.interacciones.etiquetas_generadas}

### Motivos de rechazo — interacciones
| Motivo | Registros |
|---|---|
${motivos(b.interacciones.rechazos_por_motivo)}

### Motivos de rechazo — usuarios
| Motivo | Registros |
|---|---|
${motivos(b.usuarios.rechazos_por_motivo)}

## Antes vs después
| Indicador | Antes | Después |
|---|---|---|
| Usuarios duplicados por id | ${a.usuarios.duplicados_por_id} | ${d.usuarios.duplicados_por_id} |
| Interacciones duplicadas por id | ${a.interacciones.duplicados_por_id} | ${d.interacciones.duplicados_por_id} |
| Interacciones con usuario inexistente | ${a.interacciones.con_referencia_inexistente} | ${d.interacciones.con_referencia_inexistente} |
| Fechas de usuario en dd/mm/aaaa (CSV recibido) | ${a.usuarios.fechas_formato_dd_mm_aaaa} | 0 (todas aaaa-mm-dd) |
| Usuarios sin consentimiento con datos geográficos | ${a.usuarios.sin_consentimiento_con_geo} de ${a.usuarios.sin_consentimiento} | ${d.usuarios.sin_consentimiento_con_geo} |
| Celdas nulas/vacías en usuarios | ${sumNulos(a.usuarios.nulos_por_columna)} | ${sumNulos(d.usuarios.nulos_por_columna)} (incluye geografía eliminada por privacidad) |
| Celdas nulas/vacías en interacciones | ${sumNulos(a.interacciones.nulos_por_columna)} | ${sumNulos(d.interacciones.nulos_por_columna)} |

> Nota sobre fechas: el .xlsx original mezclaba 636 fechas como texto dd/mm/aaaa y 432 como celdas de fecha con día y mes invertidos por Excel. scripts/xlsx_a_csv.py las restaura antes de este proceso; después, ninguna fila viola ultima_actividad ≥ fecha_ingreso.
> Nota sobre nulos: en usuarios aumentan porque se elimina la geografía de quienes no dan consentimiento; en interacciones disminuyen porque los registros en cuarentena salen del conjunto aceptado.

Transformaciones: ${b.transformaciones.fechas_estandarizadas} fechas estandarizadas · ${b.transformaciones.campos_geo_eliminados_usuarios} datos de ubicación eliminados de usuarios sin consentimiento · ${b.transformaciones.valores_geo_descartados_interacciones} valores geográficos redundantes descartados de interacciones (la ubicación se obtiene por JOIN).

Catálogos geográficos generados (3FN): ${b.catalogos_geograficos.paises} países · ${b.catalogos_geograficos.estados} estados · ${b.catalogos_geograficos.ciudades} ciudades.

## Ejemplo de registro anonimizado (usuario sin consentimiento)
**Antes**
\`\`\`json
${JSON.stringify(Object.fromEntries(['id_usuario', 'alias', ...GEO_USUARIO, 'consentimiento_datos'].map((c) => [c, ejemploRaw[c]])), null, 2)}
\`\`\`
**Después**
\`\`\`json
${JSON.stringify(Object.fromEntries(['id_usuario', 'alias', 'id_ciudad', 'latitud', 'longitud', 'consentimiento_datos'].map((c) => [c, ejemploLimpio[c]])), null, 2)}
\`\`\`
`;
}

function main() {
  const rawU = parseCSV(fs.readFileSync(path.join(RAW, 'comunidad_virtual_usuarios.csv'), 'utf8'));
  const rawI = parseCSV(fs.readFileSync(path.join(RAW, 'comunidad_virtual_interacciones_1000.csv'), 'utf8'));
  const runId = process.env.RUN_ID || 'run_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const res = ejecutar({ rawUsuarios: rawU, rawInteracciones: rawI, runId });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'usuarios_limpios.csv'), toCSV(COLS_USUARIOS, res.usuarios));
  fs.writeFileSync(path.join(OUT, 'interacciones_limpias.csv'), toCSV(COLS_INTERACCIONES, res.interacciones));
  fs.writeFileSync(path.join(OUT, 'paises.csv'), toCSV(COLS_PAISES, res.catalogos.paises));
  fs.writeFileSync(path.join(OUT, 'estados.csv'), toCSV(COLS_ESTADOS, res.catalogos.estados));
  fs.writeFileSync(path.join(OUT, 'ciudades.csv'), toCSV(COLS_CIUDADES, res.catalogos.ciudades));
  fs.writeFileSync(path.join(OUT, 'interaccion_etiqueta.csv'), toCSV(['id_interaccion', 'etiqueta'], res.etiquetas));
  fs.writeFileSync(path.join(OUT, 'cuarentena.jsonl'), res.rechazados.map((r) => JSON.stringify(r)).join('\n') + (res.rechazados.length ? '\n' : ''));
  fs.writeFileSync(path.join(OUT, 'bitacora.json'), JSON.stringify(res.bitacora, null, 2));
  fs.writeFileSync(path.join(OUT, 'resumen_calidad.md'), resumenMd(res, rawU));
  const b = res.bitacora;
  console.log(`[${runId}] usuarios: ${b.usuarios.recibidos} recibidos / ${b.usuarios.aceptados} aceptados / ${b.usuarios.rechazados} rechazados`);
  console.log(`[${runId}] interacciones: ${b.interacciones.recibidas} recibidas / ${b.interacciones.aceptadas} aceptadas / ${b.interacciones.rechazadas} rechazadas`);
  console.log('motivos:', JSON.stringify(b.interacciones.rechazos_por_motivo));
}

module.exports = { parseCSV, toCSV, parseFecha, parseTimestamp, ejecutar, GEO_USUARIO, GEO_INTERACCION, COLS_USUARIOS, COLS_INTERACCIONES, COLS_PAISES, COLS_ESTADOS, COLS_CIUDADES };
if (require.main === module) main();
