'use strict';
/**
 * COMMUNITY 360 - Verificación posterior a la carga (útil para capturas de evidencia).
 * Uso:  node etl/verificar.js
 * Muestra conteos en Turso y Firestore y comprueba la regla de privacidad directamente en la nube.
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const admin = require('firebase-admin');
const { credencialesFirebase } = require('./firebase_cred');

async function main() {
  for (const k of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'])
    if (!process.env[k]) throw new Error(`Falta la variable de entorno ${k} (revisa tu .env)`);

  const turso = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  console.log('=== TURSO (SQL) ===');
  for (const t of ['paises', 'estados', 'ciudades', 'usuarios', 'interacciones', 'interaccion_etiqueta']) {
    const r = await turso.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    console.log(`${t.padEnd(22)} ${r.rows[0].n}`);
  }
  const priv = await turso.execute(`SELECT COUNT(*) AS n FROM usuarios WHERE consentimiento_datos='no' AND (id_ciudad IS NOT NULL OR latitud IS NOT NULL OR longitud IS NOT NULL)`);
  console.log('\nUsuarios SIN consentimiento con datos geográficos:', priv.rows[0].n, '(debe ser 0)');
  const huer = await turso.execute(`SELECT COUNT(*) AS n FROM interacciones i LEFT JOIN usuarios u ON u.id_usuario=i.id_usuario WHERE u.id_usuario IS NULL`);
  console.log('Interacciones huérfanas en la base:', huer.rows[0].n, '(debe ser 0)');

  const credFb = credencialesFirebase();
  if (!credFb) { console.log('\nAVISO: sin credenciales de Firebase; se omite Firestore.'); return; }
  admin.initializeApp({ credential: admin.credential.cert(credFb) });
  const db = admin.firestore();
  console.log('\n=== FIRESTORE (NoSQL) ===');
  for (const c of ['cuarentena', 'bitacora_etl']) {
    const r = await db.collection(c).count().get();
    console.log(`${c.padEnd(22)} ${r.data().count} documentos`);
  }
  const motivos = await db.collection('cuarentena').where('motivo', '==', 'usuario_inexistente').count().get();
  console.log(`cuarentena por motivo "usuario_inexistente": ${motivos.data().count}`);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
