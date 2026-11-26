'use strict';
/**
 * COMMUNITY 360 - Fase 2 (parte 2): carga a la nube.
 *   - Turso (SQL):      paises, estados, ciudades, usuarios, interacciones, interaccion_etiqueta
 *   - Firestore (NoSQL): cuarentena y bitacora_etl
 * Idempotente: se puede ejecutar varias veces con el mismo run_id sin duplicar datos.
 * Uso:  node etl/load.js      (requiere .env con las credenciales y haber ejecutado etl/clean.js)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const admin = require('firebase-admin');
const { credencialesFirebase } = require('./firebase_cred');
const { parseCSV, COLS_USUARIOS, COLS_INTERACCIONES, COLS_PAISES, COLS_ESTADOS, COLS_CIUDADES } = require('./clean');

const CLEAN = path.join(__dirname, '..', 'data', 'clean');
const leerCSV = (f) => parseCSV(fs.readFileSync(path.join(CLEAN, f), 'utf8'));
const NUM = new Set(['id_pais', 'id_estado', 'id_ciudad', 'latitud', 'longitud', 'es_artista', 'mensajes_30d', 'reacciones_30d', 'eventos_asistidos',
  'comisiones_compradas', 'sentimiento_promedio', 'sentimiento', 'longitud_texto', 'reacciones_recibidas']);
const val = (c, v) => (v === '' ? null : NUM.has(c) ? Number(v) : v);
const trozos = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function upsert(tabla, cols, pk, fila) {
  const sets = cols.filter((c) => c !== pk).map((c) => `${c}=excluded.${c}`).join(', ');
  return {
    sql: `INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) ON CONFLICT(${pk}) DO UPDATE SET ${sets}`,
    args: cols.map((c) => val(c, fila[c])),
  };
}

async function main() {
  for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'])
    if (!process.env[k]) throw new Error(`Falta la variable de entorno ${k} (revisa tu .env)`);
  const credFb = credencialesFirebase();
  const usarFirestore = Boolean(credFb);

  // ---------------- Turso
  const turso = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  await turso.executeMultiple(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const fk = await turso.execute('PRAGMA foreign_keys');
  console.log('PRAGMA foreign_keys =', fk.rows[0] && Object.values(fk.rows[0])[0], '(debe ser 1)');

  const paises = leerCSV('paises.csv'); const estados = leerCSV('estados.csv'); const ciudades = leerCSV('ciudades.csv');
  const usuarios = leerCSV('usuarios_limpios.csv');
  const inter = leerCSV('interacciones_limpias.csv');
  const tags = leerCSV('interaccion_etiqueta.csv');

  // orden por dependencias: catálogos -> usuarios -> interacciones -> etiquetas
  for (const lote of trozos(paises, 200)) await turso.batch(lote.map((f) => upsert('paises', COLS_PAISES, 'id_pais', f)), 'write');
  for (const lote of trozos(estados, 200)) await turso.batch(lote.map((f) => upsert('estados', COLS_ESTADOS, 'id_estado', f)), 'write');
  for (const lote of trozos(ciudades, 200)) await turso.batch(lote.map((f) => upsert('ciudades', COLS_CIUDADES, 'id_ciudad', f)), 'write');
  for (const lote of trozos(usuarios, 200)) await turso.batch(lote.map((f) => upsert('usuarios', COLS_USUARIOS, 'id_usuario', f)), 'write');
  for (const lote of trozos(inter, 200)) await turso.batch(lote.map((f) => upsert('interacciones', COLS_INTERACCIONES, 'id_interaccion', f)), 'write');
  for (const lote of trozos(tags, 200))
    await turso.batch(lote.map((f) => ({ sql: 'INSERT OR IGNORE INTO interaccion_etiqueta (id_interaccion, etiqueta) VALUES (?, ?)', args: [f.id_interaccion, f.etiqueta] })), 'write');

  for (const t of ['paises', 'estados', 'ciudades', 'usuarios', 'interacciones', 'interaccion_etiqueta']) {
    const r = await turso.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    console.log(`Turso ${t}: ${r.rows[0].n} filas`);
  }

  // ---------------- Firestore (opcional si todavía no configuras FIREBASE_SERVICE_ACCOUNT_JSON)
  if (!usarFirestore) { console.log('AVISO: no hay credenciales de Firebase (FIREBASE_SERVICE_ACCOUNT_FILE); se omite la carga a Firestore (cuarentena y bitácora).'); return; }
  admin.initializeApp({ credential: admin.credential.cert(credFb) });
  const db = admin.firestore();
  const bitacora = JSON.parse(fs.readFileSync(path.join(CLEAN, 'bitacora.json'), 'utf8'));
  const cuarentena = fs.readFileSync(path.join(CLEAN, 'cuarentena.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

  await db.collection('bitacora_etl').doc(bitacora.run_id).set(bitacora);
  for (const lote of trozos(cuarentena, 400)) {
    const batch = db.batch();
    lote.forEach((r) => {
      const id = `${r.run_id}_${r.entidad}_${r.payload.id_interaccion || r.payload.id_usuario}`;
      batch.set(db.collection('cuarentena').doc(id), { ...r, cargado_en: admin.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
  }
  console.log(`Firestore: bitacora_etl/${bitacora.run_id} + ${cuarentena.length} documentos en cuarentena`);
}

main().catch((e) => { console.error('ERROR en la carga:', e.message); process.exit(1); });
