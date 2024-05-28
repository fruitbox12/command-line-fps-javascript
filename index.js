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
const bulletHeight = 1;
const bulletWidth = 1;
const FOV = 3.14159 / 4.0;
const depth = 16.0;
const speed = 5.0;

let playerX = 8.0;
let playerY = 8.0;
let playerA = 0.0;
let playerHealth = 100; // Initialize player health

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
  peers[id] = { socket, state: {} };

  socket.on('data', (data) => {
    const state = JSON.parse(data.toString());
    peers[state.id] = { socket, state };
  });

  socket.on('close', () => {
    delete peers[id];
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
    bullets,
    health: playerHealth // Include health in the state
  });
  socket.write(state);
};

const broadcastState = () => {
  const state = JSON.stringify({
    id: swarm.keyPair.publicKey.toString('hex'),
    x: playerX,
    y: playerY,
    a: playerA,
    bullets,
    health: playerHealth // Include health in the state
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
      console.log(`Bullet created at (${playerX}, ${playerY}) with velocity (${vx}, ${vy})`); // Debugging log
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

// Function to check for bullet collision with players
const checkBulletCollision = (bullet, playerX, playerY) => {
  const distance = Math.sqrt((bullet.x - playerX) ** 2 + (bullet.y - playerY) ** 2);
  return distance < 0.5; // Collision threshold
};

const respawnPlayer = () => {
  playerX = 8.0;
  playerY = 8.0;
  playerA = 0.0;
  playerHealth = 100;
};

const mainLoop = () => {
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
      const { x, y, a } = peers[id].state;
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

  // Render bullets in 3D view
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
      const bulletCeiling = parseInt(parseFloat(screenHeight / 2.0) - ((screenHeight / 2.0) / parseFloat(distanceFromPlayer)));
      const bulletFloor = screenHeight - bulletCeiling;
      const bulletHeight = parseInt(bulletFloor - bulletCeiling);
      const bulletAspectRatio = 1.0;
      const bulletWidth = parseInt(bulletHeight / bulletAspectRatio);
      const bulletMiddle = (0.5 * (objectAngle / (FOV / 2.0)) + 0.5) * parseFloat(screenWidth);

      for (let lx = 0; lx < bulletWidth; lx++) {
        for (let ly = 0; ly < bulletHeight; ly++) {
          const bulletX = parseInt(bulletMiddle + lx - (bulletWidth / 2.0));
          const bulletY = parseInt(bulletCeiling + ly);
          if (bulletX >= 0 && bulletX < screenWidth && bulletY >= 0 && bulletY < screenHeight) {
            if (depthBuffer[bulletX] >= distanceFromPlayer) {
              screen[bulletY * screenWidth + bulletX] = '*';
              depthBuffer[bulletX] = distanceFromPlayer;
            }
          }
        }
      }
    }
  });

  bullets = bullets.map(bullet => {
    bullet.x += bullet.vx * elapsedTime;
    bullet.y += bullet.vy * elapsedTime;

    // Check for collisions with the player
    if (checkBulletCollision(bullet, playerX, playerY)) {
      playerHealth -= 10; // Reduce player health on hit
      bullet.remove = true;
    }

    // Check for collisions with other players
    for (const id in peers) {
      if (peers[id].state) {
        const { x, y } = peers[id].state;
        if (checkBulletCollision(bullet, x, y)) {
          peers[id].state.health -= 10; // Reduce other player's health on hit
          bullet.remove = true;
        }
      }
    }

    if (map[parseInt(bullet.x) * mapWidth + parseInt(bullet.y)] === '#') bullet.remove = true;
    return bullet;
  }).filter(bullet => !bullet.remove);

  if (playerHealth <= 0) {
    console.log('Player died. Respawning...');
    respawnPlayer();
  }

  for (let y = 0; y < screenHeight; y++) {
    jetty.text(screen.slice(y * screenWidth, (y + 1) * screenWidth).join(''));
    jetty.text('\n');
  }

  requestAnimationFrame(mainLoop);
};

initEvents();
mainLoop();
