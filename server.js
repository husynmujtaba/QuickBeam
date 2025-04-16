// Simple Node.js signaling server for P2P file sharing
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Map of roomId -> [clients]
const rooms = {};

wss.on('connection', function connection(ws) {
  let roomId = null;

  ws.on('message', function incoming(message) {
    try {
      const data = JSON.parse(message);
      if (data.type === 'join') {
        roomId = data.room;
        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push(ws);
        // Notify peer if both are present
        if (rooms[roomId].length === 2) {
          rooms[roomId].forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'ready' }));
            }
          });
        }
      } else if (data.type === 'signal' && roomId && rooms[roomId]) {
        // Relay signaling messages to the other peer
        rooms[roomId].forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'signal', data: data.data }));
          }
        });
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(client => client !== ws);
      if (rooms[roomId].length === 0) delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on http://localhost:${PORT}`);
});
