import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { store } from './server/db/store.js';
import { setupWebSocket } from './server/websocket.js';
import { monitoringPoller } from './server/monitoring/poller.js';
import { esxiSoapDaemon } from './server/services/esxiSoapDaemon.js';

// Route imports
import authRoutes from './server/routes/auth.routes.js';
import dashboardRoutes from './server/routes/dashboard.routes.js';
import infrastructureRoutes from './server/routes/infrastructure.routes.js';
import esxiRoutes from './server/routes/esxi.routes.js';
import casaosRoutes from './server/routes/casaos.routes.js';
import dockerRoutes from './server/routes/docker.routes.js';
import monitoringRoutes from './server/routes/monitoring.routes.js';
import alertsRoutes from './server/routes/alerts.routes.js';
import notificationsRoutes from './server/routes/notifications.routes.js';
import logsRoutes from './server/routes/logs.routes.js';
import usersRoutes from './server/routes/users.routes.js';
import settingsRoutes from './server/routes/settings.routes.js';

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Parse JSON payloads with reasonable size limits
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Start internal ESXi VMware vSphere SOAP daemon for real end-to-end telemetry testing
  await esxiSoapDaemon.start().catch(err => console.error('[ESXiSoapDaemon] start error:', err));

  // Initialize DB store and seed default state
  await store.init();

  // Setup WebSocket real-time engine
  setupWebSocket(server);

  // Start background monitoring poller
  monitoringPoller.start();

  // Health probe
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'noc-infrastructure-manager',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // REST API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/infrastructure', infrastructureRoutes);
  app.use('/api/esxi', esxiRoutes);
  app.use('/api/casaos', casaosRoutes);
  app.use('/api/docker', dockerRoutes);
  app.use('/api/monitoring', monitoringRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/settings', settingsRoutes);

  // Vite middleware for development vs Static file serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[NOC Platform] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[NOC Platform] Fatal server startup error:', err);
  process.exit(1);
});
