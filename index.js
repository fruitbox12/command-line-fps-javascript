const keypress = require('keypress');
const Jetty = require('jetty');
const { performance } = require('perf_hooks');
const requestAnimationFrame = require('./requestAnimationFrame');
const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');

const jetty = new Jetty(process.stdout);

keypress(process.stdin);
jetty.clear();

const screen = [];
let bullets = [];
const depthBuffer = [];

const map = (
  '################' +
  '#..............#' +
  '#..............#' +
  '#....##.....####' +
  '#..............#' +
  '#..............#' +
  '#.....##.......#' +
  '#.....##.......#' +
  '#..............#' +
  '#..............#' +
  '#........#######' +
  '#..............#' +
  '######.........#' +
  '#..............#' +
  '#..............#' +
  '################'
).trim();

const screenWidth = 120;
const screenHeight = 40;
const mapWidth = 16;
const mapHeight = 16;
const bulletHeight = 5;
const bulletWidth = 10;
const FOV = 3.14159 / 4.0;
const depth = 16.0;
const speed = 5.0;

let playerX = 8.0;
let playerY = 8.0;
let playerA = 0.0;
let playerHealth = 100;
let gameState = 'lobby'; // 'lobby' or 'game'

let t1 = performance.now();
let t2 = performance.now();
let elapsedTime = 0;

// Initialize Hyperswarm
const swarm = new Hyperswarm();
const topic = crypto.createHash('sha256').update('command-line-fps').digest(); // Topic for the swarm
const peers = {}; // Store other peers' states

swarm.join(topic, {
  lookup: true, // find and connect to peers
  announce: true // announce self as a connection target
});

swarm.on('connection', (socket, peerInfo) => {
  console.log('New connection!');
  const id = peerInfo.publicKey.toString('hex');
  peers[id] = { socket, state: { health: 100, ready: false } };

  socket.on('data', (data) => {
    const state = JSON.parse(data.toString());
    peers[state.id] = { socket, state };
    if (gameState === 'lobby') renderLobby();
  });

  socket.on('close', () => {
    delete peers[id];
    if (gameState === 'lobby') renderLobby();
  });

  // Send current state to the new peer
  sendState(socket);
});

const sendState = (socket) => {
  const state = JSON.stringify({
    id: swarm.keyPair.publicKey.toString('hex'),
    x: playerX,
    y: playerY,
    a: playerA,
    health: playerHealth,
    bullets,
    ready: gameState === 'lobby' ? false : true
  });
  socket.write(state);
};

const broadcastState = () => {
  const state = JSON.stringify({
    id: swarm.keyPair.publicKey.toString('hex'),
    x: playerX,
    y: playerY,
    a: playerA,
    health: playerHealth,
    bullets,
    ready: gameState === 'lobby' ? false : true
  });
  for (const id in peers) {
    if (peers[id].socket) {
      peers[id].socket.write(state);
    }
  }
};

const initEvents = () => {
  process.stdin.on('keypress', function (ch, key) {
    if (key && key.ctrl && key.name == 'c') {
      process.exit(1);
    }

    if (gameState === 'game') {
      if (key.name === 'left') {
        playerA -= (speed * 0.75) * elapsedTime;
      }

      if (key.name === 'right') {
        playerA += (speed * 0.75) * elapsedTime;
      }

      if (key.name === 'up') {
        playerX += Math.sin(playerA) * speed * elapsedTime;
        playerY += Math.cos(playerA) * speed * elapsedTime;

        if (map[parseInt(playerX) * mapWidth + parseInt(playerY)] === '#') {
          playerX -= Math.sin(playerA) * speed * elapsedTime;
          playerY -= Math.cos(playerA) * speed * elapsedTime;
        }
      }

      if (key.name === 'down') {
        playerX -= Math.sin(playerA) * speed * elapsedTime;
        playerY -= Math.cos(playerA) * speed * elapsedTime;
        if (map[parseInt(playerX) * mapWidth + parseInt(playerY)] === '#') {
          playerX += Math.sin(playerA) * speed * elapsedTime;
          playerY += Math.cos(playerA) * speed * elapsedTime;
        }
      }

      if (key.name === 'space') {
        const noise = (Math.random() - 0.5) * 0.1;
        const vx = Math.sin(playerA + noise) * 8.0;
        const vy = Math.cos(playerA + noise) * 8.0;
        bullets.push({ x: playerX, y: playerY, vx, vy });
      }
    } else if (gameState === 'lobby') {
      if (key.name === 'enter') {
        startGame();
      }
    }

    broadcastState();
  });

  process.stdin.setRawMode(true);
  process.stdin.resume();
};

// ASCII Art for enemy players
const enemyArt = [
  "    .---.    ",
  "  /_____\\  ",
  "  ( '.' )  ",
  "   \\_-_/  ",
  "  .-\"`'V'//-. ",
  " / ,   |// , \\ ",
  "/ /|Ll //Ll|\\ \\ ",
  "/ / |__//   | \\_\\ ",
  "\\ \\/---|[]==| / / ",
  "\\/\\__/ |   \\/\\/ ",
  "|/_   | Ll_\\| ",
  "  |`^\"\"\"^`| ",
  "  |   |   | ",
  "  |   |   | ",
  "  |   |   | ",
  "  |   |   | ",
  "  L___l___J ",
  "   |_ | _|  ",
  "(___|___) ",
  "^^^ ^^^ "
];

// Function to get enemy player ASCII art in red
const getEnemyPlayerChar = (x, y) => {
  const artX = parseInt(x * enemyArt[0].length);
  const artY = parseInt(y * enemyArt.length);
  if (artY < enemyArt.length && artX < enemyArt[artY].length) {
    return `\x1b[31m${enemyArt[artY][artX]}\x1b[0m`; // Red color
  }
  return ' ';
};

// Function to get bullet ASCII art
const getBulletChar = (x, y) => {
  const newX = parseInt(x * bulletWidth);
  const newY = parseInt(y * bulletHeight);
  if (newY === parseInt(bulletHeight / 2) && (newX === parseInt(bulletWidth / 2) || newX === parseInt(bulletWidth / 2) - 1)) {
    return '*';
  }
  return ' ';
};

const renderLobby = () => {
  jetty.clear();
  jetty.moveTo([0, 0]);
  jetty.text('Lobby - Press Enter to start the game\n\n');

  jetty.text(`Local Player\n`);
  jetty.text(`Health: ${playerHealth}\n\n`);

  for (const id in peers) {
    const { state } = peers[id];
    jetty.text(`Player: ${id}\n`);
    jetty.text(`Health: ${state.health}\n`);
    jetty.text(`Ready: ${state.ready ? 'Yes' : 'No'}\n\n`);
  }
};

const startGame = () => {
  gameState = 'game';
  for (const id in peers) {
    if (peers[id].state) {
      peers[id].state.ready = true;
    }
  }
  broadcastState();
  mainLoop();
};

const mainLoop = () => {
  if (gameState !== 'game') return;

  t2 = performance.now();
  elapsedTime = (t2 - t1) / 1000;
  t1 = t2;
  jetty.moveTo([0, 0]);
  jetty.text(`X=${playerX.toFixed(2)} Y=${playerY.toFixed(2)} A=${playerA.toFixed(2)} Health=${playerHealth} FPS=${(1.0 / elapsedTime).toFixed(2)}\n`);

  for (let x = 0; x < screenWidth; x++) {
    const rayAngle = (playerA - FOV / 2.0) + (x / screenWidth) * FOV;
    const stepSize = 0.1;
    let distanceToWall = 0.0;
    let hitWall = false;
    let boundary = false;
    const eyeX = Math.sin(rayAngle);
    const eyeY = Math.cos(rayAngle);

    while (!hitWall && distanceToWall < depth) {
      distanceToWall += stepSize;
      const testX = parseInt(playerX + eyeX * distanceToWall);
      const testY = parseInt(playerY + eyeY * distanceToWall);

      if (testX < 0 || testX >= mapWidth || testY < 0 || testY >= mapHeight) {
        hitWall = true;
        distanceToWall = depth;
      } else {
        if (map[testX * mapWidth + testY] === '#') {
          hitWall = true;
          const p = [];
          for (let x = 0; x < 2; x++) {
            for (let y = 0; y < 2; y++) {
              const vy = parseFloat(testY) + y - playerY;
              const vx = parseFloat(testX) + x - playerX;
              const d = Math.sqrt(vx * vx + vy * vy);
              const dot = (eyeX * vx / d) + (eyeY * vy / d);
              p.push([d, dot]);
            }
          }
          p.sort((a, b) => a[0] - b[0]);
          const bound = 0.01;
          if (Math.acos(p[0][1]) < bound) boundary = true;
          if (Math.acos(p[1][1]) < bound) boundary = true;
          if (Math.acos(p[2][1]) < bound) boundary = true;
        }
      }
    }

    const ceiling = parseInt(parseFloat(screenHeight / 2.0) - (screenHeight / parseFloat(distanceToWall)));
    const floor = parseInt(screenHeight - ceiling);
    depthBuffer[x] = distanceToWall;

    let shade = ' ';
    if (distanceToWall <= depth / 4.0) shade = String.fromCharCode(9608);
    else if (distanceToWall < depth / 3.0) shade = String.fromCharCode(9619);
    else if (distanceToWall < depth / 2.0) shade = String.fromCharCode(9618);
    else if (distanceToWall < depth) shade = String.fromCharCode(9617);
    else shade = ' ';
    if (boundary) shade = ' ';

    for (let y = 0; y < screenHeight; y++) {
      if (y <= ceiling) screen[y * screenWidth + x] = ' ';
      else if (y > ceiling && y <= floor) screen[y * screenWidth + x] = shade;
      else {
        let floorShade = ' ';
        let b = 1.0 - ((parseFloat(y) - screenHeight / 2.0) / (parseFloat(screenHeight) / 2.0));
        if (b < 0.25) floorShade = '#';
        else if (b < 0.5) floorShade = 'x';
        else if (b < 0.75) floorShade = '.';
        else if (b < 0.9) floorShade = '-';
        else floorShade = ' ';
        screen[y * screenWidth + x] = floorShade;
      }
    }
  }

  for (let x = 0; x < mapWidth; x++) {
    for (let y = 0; y < mapWidth; y++) {
      screen[y * screenWidth + x] = map[y * mapWidth + x];
    }
  }

  screen[parseInt(playerX) * screenWidth + parseInt(playerY)] = 'P';

  // Render other players in 3D view
  for (const id in peers) {
    if (peers[id].state) {
      const { x, y, a, health } = peers[id].state;
      const vecX = x - playerX;
      const vecY = y - playerY;
      const distanceFromPlayer = Math.sqrt(vecX * vecX + vecY * vecY);
      const eyeX = Math.sin(playerA);
      const eyeY = Math.cos(playerA);
      let objectAngle = Math.atan2(eyeY, eyeX) - Math.atan2(vecY, vecX);
      if (objectAngle < -3.14159) objectAngle += 2.0 * 3.14159;
      if (objectAngle > 3.14159) objectAngle -= 2.0 * 3.14159;
      const inPlayerFOV = Math.abs(objectAngle) < (FOV / 2.0);
      if (inPlayerFOV && distanceFromPlayer >= 0.5 && distanceFromPlayer < depth) {
        const objectCeiling = parseInt(parseFloat(screenHeight / 2.0) - ((screenHeight / 2.0) / parseFloat(distanceFromPlayer)));
        const objectFloor = screenHeight - objectCeiling;
        const objectHeight = parseInt(objectFloor - objectCeiling);
        const objectAspectRatio = parseFloat(enemyArt.length / enemyArt[0].length);
        const objectWidth = parseInt(objectHeight / objectAspectRatio);
        const middleOfObject = (0.5 * (objectAngle / (FOV / 2.0)) + 0.5) * parseFloat(screenWidth);
        for (let lx = 0; lx < objectWidth; lx++) {
          for (let ly = 0; ly < objectHeight; ly++) {
            const sampleX = parseFloat(lx / objectWidth);
            const sampleY = parseFloat(ly / objectHeight);
            const char = getEnemyPlayerChar(sampleX, sampleY);
            const objectColumn = parseInt(middleOfObject + lx - (objectWidth / 2.0));
            if (objectColumn >= 0 && objectColumn < screenWidth) {
              if (char !== ' ' && depthBuffer[objectColumn] >= distanceFromPlayer) {
                screen[objectColumn + (parseInt(objectCeiling + ly) * screenWidth)] = char;
                depthBuffer[objectColumn] = distanceFromPlayer;
              }
            }
          }
        }
      }
    }
  }

  bullets.forEach(bullet => {
    const vecX = bullet.x - playerX;
    const vecY = bullet.y - playerY;
    const distanceFromPlayer = Math.sqrt(vecX * vecX + vecY * vecY);
    const eyeX = Math.sin(playerA);
    const eyeY = Math.cos(playerA);
    let objectAngle = Math.atan2(eyeY, eyeX) - Math.atan2(vecY, vecX);
    if (objectAngle < -3.14159) objectAngle += 2.0 * 3.14159;
    if (objectAngle > 3.14159) objectAngle -= 2.0 * 3.14159;
    const inPlayerFOV = Math.abs(objectAngle) < (FOV / 2.0);
    if (inPlayerFOV && distanceFromPlayer >= 0.5 && distanceFromPlayer < depth && !bullet.remove) {
      const objectCeiling = parseInt(parseFloat(screenHeight / 2.0) - ((screenHeight / 2.0) / parseFloat(distanceFromPlayer)));
      const objectFloor = screenHeight - objectCeiling;
      const objectHeight = parseInt(objectFloor - objectCeiling);
      const objectAspectRatio = parseFloat(bulletHeight / bulletWidth);
      const objectWidth = parseInt(objectHeight / objectAspectRatio);
      const middleOfObject = (0.5 * (objectAngle / (FOV / 2.0)) + 0.5) * parseFloat(screenWidth);
      for (let lx = 0; lx < objectWidth; lx++) {
        for (let ly = 0; ly < objectHeight; ly++) {
          const sampleX = parseFloat(lx / objectWidth);
          const sampleY = parseFloat(ly / objectHeight);
          const char = getBulletChar(sampleX, sampleY);
          const objectColumn = parseInt(middleOfObject + lx - (objectWidth / 2.0));
          if (objectColumn >= 0 && objectColumn < screenWidth) {
            if (char !== ' ' && depthBuffer[objectColumn] >= distanceFromPlayer) {
              screen[objectColumn + (parseInt(objectCeiling + ly) * screenWidth)] = char;
              depthBuffer[objectColumn] = distanceFromPlayer;
            }
          }
        }
      }
    }

    if (map[parseInt(bullet.x) * mapWidth + parseInt(bullet.y)] === '#') {
      bullet.remove = true;
    } else {
      for (const id in peers) {
        if (peers[id].state) {
          const { x, y } = peers[id].state;
          const bulletDist = Math.sqrt((bullet.x - x) ** 2 + (bullet.y - y) ** 2);
          if (bulletDist < 0.5) {
            peers[id].state.health -= 10;
            bullet.remove = true;
            if (peers[id].state.health <= 0) {
              delete peers[id]; // Remove the peer if health is zero or below
            }
            break;
          }
        }
      }
    }

    bullet.x += bullet.vx * elapsedTime;
    bullet.y += bullet.vy * elapsedTime;
  });

  bullets = bullets.filter(bullet => !bullet.remove);

  for (let y = 0; y < screenHeight; y++) {
    jetty.text(screen.slice(y * screenWidth, (y + 1) * screenWidth).join(''));
    jetty.text('\n');
  }

  // Render crosshair
  const crosshair = [
    '   +   ',
    '   |   ',
    '---+---',
    '   |   ',
    '   +   ',
  ];
  const crosshairX = Math.floor(screenWidth / 2) - 3;
  const crosshairY = Math.floor(screenHeight / 2) - 2;

  for (let i = 0; i < crosshair.length; i++) {
    jetty.moveTo([crosshairY + i, crosshairX]);
    jetty.text(crosshair[i]);
  }

  requestAnimationFrame(mainLoop);
};

initEvents();
renderLobby(); // Initially render the lobby
