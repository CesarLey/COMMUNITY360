'use strict';
// Lee las credenciales de Firebase desde un archivo (FIREBASE_SERVICE_ACCOUNT_FILE) o desde una variable
// con el JSON en una sola línea (FIREBASE_SERVICE_ACCOUNT_JSON). Devuelve null si no hay ninguna.
const fs = require('fs');
function credencialesFirebase() {
  const archivo = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (archivo) return JSON.parse(fs.readFileSync(archivo.replace(/^["']|["']$/g, ''), 'utf8'));
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return null;
}
module.exports = { credencialesFirebase };
