const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const usersFile = 'users.json';
let users = {};
let connectedUsers = []; // Lista de usuarios conectados

// Leer usuarios del archivo JSON
fs.readFile(usersFile, (err, data) => {
  if (!err) {
    users = JSON.parse(data);
  }
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'register':
        handleRegister(ws, data);
        break;
      case 'login':
        handleLogin(ws, data);
        break;
      case 'message':
        handleMessage(ws, data);
        break;
      case 'privateMessage':
        handlePrivateMessage(ws, data);
        break;
    }
  });

  ws.on('close', () => {
    if (ws.nickname) {
      connectedUsers = connectedUsers.filter(user => user !== ws.nickname); // Eliminar usuario de la lista de usuarios conectados
      broadcastConnectedUsers(); // Transmitir la lista actualizada de usuarios conectados
      broadcast(`${ws.nickname} ha marxat de la sala.`);
    }
  });
});

function handleRegister(ws, data) {
  const { nickname, password } = data;
  if (!users[nickname]) {
    users[nickname] = password;
    fs.writeFile(usersFile, JSON.stringify(users), (err) => {
      if (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Error al registrar el usuario' }));
      } else {
        ws.nickname = nickname;
        connectedUsers.push(nickname); // Agregar usuario a la lista de usuarios conectados
        broadcastConnectedUsers(); // Transmitir la lista actualizada de usuarios conectados
        ws.send(JSON.stringify({ type: 'registerSuccess', message: 'Usuari registrat correctament' }));
        broadcast(`${nickname} s'ha unit a la sala.`);
      }
    });
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Aquest nick ja està en ús' }));
  }
}

function handleLogin(ws, data) {
  const { nickname, password } = data;
  if (users[nickname] && users[nickname] === password) {
    ws.nickname = nickname;
    connectedUsers.push(nickname); // Agregar usuario a la lista de usuarios conectados
    broadcastConnectedUsers(); // Transmitir la lista actualizada de usuarios conectados
    ws.send(JSON.stringify({ type: 'loginSuccess', message: 'T\'has autenticat correctament' }));
    broadcast(`${nickname} s'ha unit a la sala.`);
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Credencials incorrectes' }));
    ws.close();
  }
}

function handleMessage(ws, data) {
  if (ws.nickname) {
    const { message } = data;
    if (message.startsWith('/')) {
      const spaceIndex = message.indexOf(' ');
      if (spaceIndex !== -1) {
        const to = message.substring(1, spaceIndex);
        const privateMessage = message.substring(spaceIndex + 1);
        handlePrivateMessage(ws, { to, message: privateMessage });
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid private message format. Please use /name message.' }));
      }
    } else {
      const fullMessage = `${ws.nickname}: ${message}`;
      broadcast(fullMessage);
    }
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'You are not authenticated' }));
  }
}

function handlePrivateMessage(ws, data) {
  const { to, message } = data;
  const targetUser = Array.from(wss.clients).find(client => client.nickname === to);
  if (targetUser) {
    targetUser.send(JSON.stringify({ type: 'privateMessage', from: ws.nickname, message }));
    ws.send(JSON.stringify({ type: 'privateMessage', to, message })); // Confirmación para el remitente
  } else {
    ws.send(JSON.stringify({ type: 'error', message: `Usuari ${to} no trobat` }));
  }
}

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'message', text: message }));
    }
  });
}

function broadcastConnectedUsers() {
  const connectedUsersData = JSON.stringify({ type: 'connectedUsers', users: connectedUsers });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(connectedUsersData);
    }
  });
}

server.listen(3000, () => {
  console.log('Servidor engegat a http://localhost:3000');
});
