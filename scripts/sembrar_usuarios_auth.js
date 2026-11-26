'use strict';
/**
 * Script para sembrar / inicializar los usuarios autorizados en Turso.
 * Incluye al usuario docente especificado en los lineamientos:
 *   Usuario: lizandro.reyes
 *   Email: lizandro.reyes@utmetropolitana.edu.mx
 *   Contraseña: lizandr0_reye$
 *   Rol: admin
 * 
 * Uso: node scripts/sembrar_usuarios_auth.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error('Faltan variables TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en .env');
  }

  const turso = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const usuariosAInsertar = [
    {
      username: 'lizandro.reyes',
      email: 'lizandro.reyes@utmetropolitana.edu.mx',
      passwordPlano: 'lizandr0_reye$',
      rol: 'admin',
    },
    {
      username: 'admin',
      email: 'admin@community360.local',
      passwordPlano: 'Admin360*Seguro',
      rol: 'admin',
    },
    {
      username: 'analista',
      email: 'analista@community360.local',
      passwordPlano: 'Analista360*2026',
      rol: 'analista',
    }
  ];

  console.log('=== Sembrando usuarios de autenticación en Turso ===');

  for (const u of usuariosAInsertar) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(u.passwordPlano, saltRounds);

    await turso.execute({
      sql: `
        INSERT INTO usuarios_auth (username, email, password_hash, rol)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          email = excluded.email,
          password_hash = excluded.password_hash,
          rol = excluded.rol
      `,
      args: [u.username, u.email, passwordHash, u.rol],
    });

    console.log(`✓ Usuario listo: "${u.username}" | Email: "${u.email}" | Rol: "${u.rol}"`);
  }

  const res = await turso.execute('SELECT id_auth, username, email, rol, creado_en FROM usuarios_auth');
  console.log('\nUsuarios registrados en la nube (Turso):');
  console.table(res.rows);
}

main().catch(err => {
  console.error('Error sembrando usuarios:', err);
  process.exit(1);
});
