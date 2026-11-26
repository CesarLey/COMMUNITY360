'use strict';
require('dotenv').config();
const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.warn('ADVERTENCIA: Falta configurar TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en .env');
}

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL || '',
  authToken: process.env.TURSO_AUTH_TOKEN || '',
});

module.exports = turso;
