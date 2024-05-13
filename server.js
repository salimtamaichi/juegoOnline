const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const { create } = require('domain');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const usersFile = 'users.json';
let users = {};
let connectedUsers = []; // Lista de usuarios conectados

let games = [];
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
      case 'gameRequest':
        handleGameRequest(ws, data);
        break;
      case 'close':
        handleUserDisconnect(ws);
        break;
      case 'sendGame':
        sendGameRequest(user);
        break;
      case 'acceptGameRequest':
        acceptGameRequest(ws, data);
        createGame(ws.nickname, data.destinatario);
        break;
      case 'handleTurn':
        handleTurn(ws, data);
        break;
    }
  });

  ws.on('close', () => {
    handleUserDisconnect(ws);
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
        ws.send(JSON.stringify({ type: 'registerSuccess', message: 'Usuario registrado correctamente' }));
        broadcast(`${nickname} se ha unido a la sala.`);
      }
    });
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Este nickname ya está en uso' }));
  }
}

function handleLogin(ws, data) {
  const { nickname, password } = data;
  if (users[nickname] && users[nickname] === password) {
    ws.nickname = nickname;
    connectedUsers.push(nickname); // Agregar usuario a la lista de usuarios conectados
    broadcastConnectedUsers(); // Transmitir la lista actualizada de usuarios conectados
    ws.send(JSON.stringify({ type: 'loginSuccess', message: 'Te has autenticado correctamente' }));
    broadcast(`${nickname} se ha unido a la sala.`);
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Credenciales incorrectas' }));
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
    ws.send(JSON.stringify({ type: 'error', message: 'No estás autenticado' }));
  }
}

function handlePrivateMessage(ws, data) {
  const { to, message } = data;
  const targetUser = Array.from(wss.clients).find(client => client.nickname === to);
  if (targetUser) {
    targetUser.send(JSON.stringify({ type: 'privateMessage', from: ws.nickname, message }));
    ws.send(JSON.stringify({ type: 'privateMessage', from: ws.nickname, message })); // Confirmación para el remitente
  } else {
    ws.send(JSON.stringify({ type: 'error', message: `Usuario ${to} no encontrado` }));
  }
}

// function handleGameRequest(ws, data) {
//   const { to } = data;
//   const targetUser = Array.from(wss.clients).find(client => client.nickname === to);
//   if (targetUser) {
//     // Enviar la solicitud de juego al usuario objetivo
//     targetUser.send(JSON.stringify({ type: 'gameRequest', from: ws.nickname }));
//   } else {
//     ws.send(JSON.stringify({ type: 'error', message: `Usuario ${to} no encontrado` }));
//   }
// }

function handleGameRequest(ws, data) {
  let nickname = ws.nickname;
  let connection = findUserConnection(data.destinatario);
  connection.send(JSON.stringify({ type: 'gameRequest', from: nickname }));

}

function acceptGameRequest(ws, data) {
  let nickname = ws.nickname;
  let connection = findUserConnection(data.destinatario);
  connection.send(JSON.stringify({ type: 'acceptGameRequest', from: nickname }));
}

function handleUserDisconnect(ws) {
  if (ws.nickname) {
    connectedUsers = connectedUsers.filter(user => user !== ws.nickname); // Eliminar usuario de la lista de usuarios conectados
    broadcastConnectedUsers(); // Transmitir la lista actualizada de usuarios conectados
    broadcast(`${ws.nickname} ha salido de la sala.`);
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


function findUserConnection(username) {
  const targetUser = Array.from(wss.clients).find(client => client.nickname === username);
  return targetUser;
}

// Función para enviar una solicitud de juego al usuario
function sendGameRequest(user) {
  // Mostrar confirmación solo en respuesta a la interacción del usuario
  const button = document.getElementById('sendGameRequestButton'); // Suponiendo que hay un botón con este id
  button.addEventListener('click', function() {
    const confirmGame = confirm(`¿Quieres jugar al tic-tac-toe con ${user}?`);
    if (confirmGame) {
      const userConnection = findUserConnection(user);
      if (userConnection) {
        userConnection.send(JSON.stringify({ type: 'gameRequest', from: loggedInUser }));
      } else {
        alert(`No se pudo encontrar la conexión para ${user}.`);
      }
    }
  });
}


function createGame(user1, user2) {
  games.push({
    player1: user1,
    player2: user2,
    turn: user1,
    table: [
      [' ', ' ', ' '],
      [' ', ' ', ' '],
      [' ', ' ', ' ']
    ]
  });

  sendGame(user1, user2);
}

function sendGame(player1, player2) {
  const game = buscarJuego(player1, player2);
  if (game) {
    const connection1 = findUserConnection(player1);
    const connection2 = findUserConnection(player2);

    if (connection1 && connection2) {
      const gameData = {
        type: 'game_data',
        game: game
      };
      connection1.send(JSON.stringify(gameData));
      connection2.send(JSON.stringify(gameData));
    }
  }
}

function buscarJuego(user1, user2) {
  return games.find(game =>
    (game.player1 === user1 && game.player2 === user2) ||
    (game.player1 === user2 && game.player2 === user1)
  );
}

function handleTurn(ws, data) {
  let foundGame = buscarJuego(data.player1, data.player2);

  if (foundGame) {
    if (foundGame.turn == ws.nickname) {
      if (foundGame.table[data.row][data.column] == ' ') {
        let ficha;
        console.log(foundGame.player1, ws.nickname);
        if (foundGame.player1 == ws.nickname) {
          ficha = 'X';
        } else {
          ficha = 'O';
        }
        foundGame.turn = foundGame.turn === foundGame.player1 ? foundGame.player2 : foundGame.player1;
        foundGame.table[data.row][data.column] = ficha;
        console.log(foundGame);
        sendGame(data.player1, data.player2);
        const connection1 = findUserConnection(data.player1);
        const connection2 = findUserConnection(data.player2);
        // Verificar victoria
        if (verificarVictoria(foundGame.table, ficha)) {
          const data = {
            type: 'finnished',
            message: 'Ha ganado el jugador ' + ws.nickname
          };
          connection1.send(JSON.stringify(data));
          connection2.send(JSON.stringify(data));
          // Eliminar el juego del array
          games.splice(games.indexOf(foundGame), 1);
        } else if (verificarEmpate(foundGame.table)) {
          const data = {
            type: 'finnished',
            message: 'Habeis empatado!'
          };
          connection1.send(JSON.stringify(data));
          connection2.send(JSON.stringify(data));
          // Eliminar el juego del array
          games.splice(games.indexOf(foundGame), 1);
        }
      }
    }
  }
}


function verificarVictoria(tablero, ficha) {
  // Verificar líneas horizontales
  for (let i = 0; i < 3; i++) {
    if (tablero[i][0] === ficha && tablero[i][1] === ficha && tablero[i][2] === ficha) {
      return true;
    }
  }
  // Verificar líneas verticales
  for (let j = 0; j < 3; j++) {
    if (tablero[0][j] === ficha && tablero[1][j] === ficha && tablero[2][j] === ficha) {
      return true;
    }
  }
  // Verificar diagonales
  if ((tablero[0][0] === ficha && tablero[1][1] === ficha && tablero[2][2] === ficha) ||
    (tablero[0][2] === ficha && tablero[1][1] === ficha && tablero[2][0] === ficha)) {
    return true;
  }
  return false;
}

function verificarEmpate(tablero) {
  for (let i = 0; i < tablero.length; i++) {
    for (let j = 0; j < tablero[i].length; j++) {
      if (tablero[i][j] === ' ') {
        return false; // Todavía hay casillas vacías, no es un empate
      }
    }
  }
  return true; // Todas las casillas están ocupadas, hay un empate
}


server.listen(3000, () => {
  console.log('Servidor en marcha en http://localhost:3000');
});
