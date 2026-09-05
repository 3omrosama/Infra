import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    clients.add(ws);

    // Send initial handshake ping
    ws.send(JSON.stringify({
      type: 'INIT',
      message: 'Connected to NOC Infrastructure Real-Time Telemetry Stream',
      timestamp: new Date().toISOString()
    }));

    ws.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (err) {
        // ignore malformed ws messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  console.log('[WebSocket] Real-time event server listening on /ws');
}

export function broadcastToAll(payload: { type: string; data?: any; message?: string; connectionId?: string; timestamp?: string }) {
  if (!wss || clients.size === 0) return;

  const dataStr = JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString()
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(dataStr);
      } catch (err) {
        clients.delete(client);
      }
    }
  });
}
