'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const interaccionesRoutes = require('./routes/interacciones');
const metricasRoutes = require('./routes/metricas');
const { inicializarWS } = require('./ws');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Inicializar WebSocket Server adjunto al servidor HTTP
inicializarWS(server);

// Middlewares globales
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rutas de API REST
app.use('/api/auth', authRoutes);
app.use('/api/interacciones', interaccionesRoutes);
app.use('/api/metricas', metricasRoutes);

// Resolver directorio de compilación de Angular (public o public/browser)
const publicRoot = path.join(__dirname, '..', 'public');
const browserSubdir = path.join(publicRoot, 'browser');
const getStaticDir = () =>
  fs.existsSync(path.join(publicRoot, 'index.html')) ? publicRoot : browserSubdir;

app.use((req, res, next) => {
  express.static(getStaticDir(), { index: false })(req, res, next);
});

// Compatibilidad de rutas legadas hacia el router SPA de Angular
app.get('/login.html', (req, res) => res.redirect('/login'));
app.get('/dashboard.html', (req, res) => res.redirect('/dashboard'));

// Catch-all SPA para Angular Router (excluyendo /api/*)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Ruta API no encontrada' });
  }
  const indexPath = path.join(getStaticDir(), 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(503).json({
    error: 'Frontend Angular no compilado',
    mensaje: 'Ejecute npm run build dentro de frontend/'
  });
});

// Si se ejecuta directamente, iniciar servidor HTTP y WebSocket
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('=================================================');
    console.log(` Servidor Community 360 iniciado en el puerto ${PORT}`);
    console.log(` Aplicación Angular: http://localhost:${PORT}`);
    console.log(` WebSocket URL:      ws://localhost:${PORT}/ws`);
    console.log('=================================================');
  });
}

module.exports = { app, server };
