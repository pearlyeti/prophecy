import { createServer } from 'node:http';

import { Server } from 'socket.io';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'game-server' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173',
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`[game-server] connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[game-server] disconnected: ${socket.id} (${reason})`);
  });

  // Room lifecycle, action intents, and engine event broadcast wire up here.
});

const port = Number(process.env.GAME_SERVER_PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`game-server listening on http://localhost:${port}`);
});
