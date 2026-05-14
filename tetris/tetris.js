// ── Constants ──────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // px per cell

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

const TYPES = Object.keys(SHAPES);

// Score per lines cleared (multiplied by level)
const LINE_SCORES = [0, 100, 300, 500, 800];

// Drop interval in ms per level (level 1–10+)
function dropInterval(level) {
  return Math.max(80, 800 - (level - 1) * 70);
}

// ── Canvas setup ───────────────────────────────────────────────────────────
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nCtx = nextCanvas.getContext('2d');

// ── Game state ─────────────────────────────────────────────────────────────
let board, piece, nextPiece, score, level, lines;
let state; // 'idle' | 'playing' | 'paused' | 'over'
let dropTimer, lastDrop;
let animId;

// ── Piece factory ──────────────────────────────────────────────────────────
function makePiece(type) {
  return {
    type,
    color: COLORS[type],
    matrix: SHAPES[type].map(row => [...row]),
    x: Math.floor(COLS / 2) - Math.floor(SHAPES[type][0].length / 2),
    y: 0,
  };
}

function randomType() {
  return TYPES[Math.floor(Math.random() * TYPES.length)];
}

// ── Board helpers ──────────────────────────────────────────────────────────
function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function collides(p, dx = 0, dy = 0, mat = p.matrix) {
  for (let r = 0; r < mat.length; r++) {
    for (let c = 0; c < mat[r].length; c++) {
      if (!mat[r][c]) continue;
      const nx = p.x + c + dx;
      const ny = p.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function lockPiece() {
  piece.matrix.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val) {
        const y = piece.y + r;
        if (y < 0) { endGame(); return; }
        board[y][piece.x + c] = piece.color;
      }
    });
  });
  clearLines();
  spawnPiece();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== null)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      r++; // recheck same row index
    }
  }
  if (cleared === 0) return;
  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level = Math.floor(lines / 10) + 1;
  updateHUD();
}

function spawnPiece() {
  piece = nextPiece;
  nextPiece = makePiece(randomType());
  if (collides(piece)) {
    endGame();
  }
  drawNext();
}

// ── Rotation (SRS wall-kick) ───────────────────────────────────────────────
function rotate(matrix) {
  const N = matrix.length;
  return matrix[0].map((_, c) => matrix.map((_, r) => matrix[N - 1 - r][c]));
}

function tryRotate() {
  const rotated = rotate(piece.matrix);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides({ ...piece, matrix: rotated }, kick, 0, rotated)) {
      piece.matrix = rotated;
      piece.x += kick;
      return;
    }
  }
}

// ── Hard drop ─────────────────────────────────────────────────────────────
function hardDrop() {
  let dropped = 0;
  while (!collides(piece, 0, 1)) {
    piece.y++;
    dropped++;
  }
  score += dropped * 2;
  updateHUD();
  lockPiece();
}

// ── Draw helpers ───────────────────────────────────────────────────────────
function drawBlock(context, x, y, color, size = BLOCK) {
  const pad = 1;
  context.fillStyle = color;
  context.fillRect(x * size + pad, y * size + pad, size - pad * 2, size - pad * 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(x * size + pad, y * size + pad, size - pad * 2, 4);
  context.fillRect(x * size + pad, y * size + pad, 4, size - pad * 2);
}

function drawGhost() {
  let ghostY = piece.y;
  while (!collides(piece, 0, ghostY - piece.y + 1)) ghostY++;
  if (ghostY === piece.y) return;
  piece.matrix.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(
          (piece.x + c) * BLOCK + 1,
          (ghostY + r) * BLOCK + 1,
          BLOCK - 2, BLOCK - 2
        );
      }
    });
  });
}

function drawBoard() {
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * BLOCK); ctx.lineTo(COLS * BLOCK, r * BLOCK); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * BLOCK, 0); ctx.lineTo(c * BLOCK, ROWS * BLOCK); ctx.stroke();
  }

  // locked blocks
  board.forEach((row, r) => {
    row.forEach((color, c) => {
      if (color) drawBlock(ctx, c, r, color);
    });
  });

  // ghost
  if (state === 'playing') drawGhost();

  // active piece
  if (piece && state !== 'over') {
    piece.matrix.forEach((row, r) => {
      row.forEach((val, c) => {
        if (val) drawBlock(ctx, piece.x + c, piece.y + r, piece.color);
      });
    });
  }
}

function drawNext() {
  nCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const size = 24;
  const mat = nextPiece.matrix;
  const offX = Math.floor((nextCanvas.width / size - mat[0].length) / 2);
  const offY = Math.floor((nextCanvas.height / size - mat.length) / 2);
  mat.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val) {
        nCtx.fillStyle = nextPiece.color;
        nCtx.fillRect((offX + c) * size + 1, (offY + r) * size + 1, size - 2, size - 2);
        nCtx.fillStyle = 'rgba(255,255,255,0.18)';
        nCtx.fillRect((offX + c) * size + 1, (offY + r) * size + 1, size - 2, 4);
        nCtx.fillRect((offX + c) * size + 1, (offY + r) * size + 1, 4, size - 2);
      }
    });
  });
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateHUD() {
  document.getElementById('score').textContent = score;
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
}

// ── Overlay ────────────────────────────────────────────────────────────────
function showOverlay(title, sub, btnText) {
  const el = document.getElementById('overlay');
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-sub').textContent = sub;
  document.getElementById('overlay-btn').textContent = btnText;
  el.classList.remove('hidden');
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

// ── Game lifecycle ─────────────────────────────────────────────────────────
function initGame() {
  board = emptyBoard();
  score = 0; level = 1; lines = 0;
  nextPiece = makePiece(randomType());
  spawnPiece();
  updateHUD();
  state = 'playing';
  hideOverlay();
  lastDrop = performance.now();
  if (animId) cancelAnimationFrame(animId);
  loop(lastDrop);
}

function endGame() {
  state = 'over';
  showOverlay('GAME OVER', `Score: ${score}`, 'RESTART');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showOverlay('PAUSED', '', 'RESUME');
  } else if (state === 'paused') {
    state = 'playing';
    hideOverlay();
    lastDrop = performance.now();
    loop(lastDrop);
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────
function loop(now) {
  if (state !== 'playing') return;
  const elapsed = now - lastDrop;
  if (elapsed >= dropInterval(level)) {
    if (collides(piece, 0, 1)) {
      lockPiece();
    } else {
      piece.y++;
    }
    lastDrop = now;
  }
  drawBoard();
  animId = requestAnimationFrame(loop);
}

// ── Input ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (state === 'idle') return;

  if (e.code === 'KeyP') { togglePause(); return; }
  if (state !== 'playing') return;

  switch (e.code) {
    case 'ArrowLeft':
      if (!collides(piece, -1, 0)) piece.x--;
      break;
    case 'ArrowRight':
      if (!collides(piece, 1, 0)) piece.x++;
      break;
    case 'ArrowDown':
      if (!collides(piece, 0, 1)) { piece.y++; score += 1; updateHUD(); }
      break;
    case 'ArrowUp':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  drawBoard();
});

document.getElementById('overlay-btn').addEventListener('click', () => {
  if (state === 'idle' || state === 'over') {
    initGame();
  } else if (state === 'paused') {
    togglePause();
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────
state = 'idle';
board = emptyBoard();
drawBoard();
showOverlay('TETRIS', 'Classic Block Game', 'START');
