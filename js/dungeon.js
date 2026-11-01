// 階層生成: 3x3 のセルに部屋を置き、隣接する部屋を通路でつなぐ

export const MAP_W = 48;
export const MAP_H = 24;

const CELL_W = 16;
const CELL_H = 8;
const GRID_W = 3;
const GRID_H = 3;

// タイル: ' ' 岩 / '#' 壁 / '.' 部屋の床 / '+' 通路・扉 / '>' 下り階段
export function isWalkable(ch) {
  return ch === '.' || ch === '+' || ch === '>';
}

function makeRoom(rng, cx, cy) {
  const w = rng.int(5, 13);
  const h = rng.int(4, 6);
  const x0 = cx * CELL_W + rng.int(1, CELL_W - w - 1);
  const y0 = cy * CELL_H + rng.int(1, CELL_H - h - 1);
  // x0,y0,x1,y1 は壁を含む外形
  return { cx, cy, x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}

// 部屋セルの選択: 6〜8 個、隣接で全部つながるようにする
function chooseCells(rng) {
  const all = [];
  for (let cy = 0; cy < GRID_H; cy++) for (let cx = 0; cx < GRID_W; cx++) all.push([cx, cy]);
  const active = new Set(all.map(([x, y]) => `${x},${y}`));
  const target = rng.int(6, 8);
  const order = all.slice().sort(() => rng.next() - 0.5);
  for (const [x, y] of order) {
    if (active.size <= target) break;
    const key = `${x},${y}`;
    active.delete(key);
    if (!connected(active)) active.add(key);
  }
  return all.filter(([x, y]) => active.has(`${x},${y}`));
}

function neighbors([x, y]) {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H);
}

function connected(activeSet) {
  const keys = [...activeSet];
  if (keys.length === 0) return true;
  const seen = new Set([keys[0]]);
  const stack = [keys[0]];
  while (stack.length) {
    const [x, y] = stack.pop().split(',').map(Number);
    for (const [nx, ny] of neighbors([x, y])) {
      const k = `${nx},${ny}`;
      if (activeSet.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return seen.size === keys.length;
}

function carve(tiles, x, y) {
  const t = tiles[y][x];
  if (t === ' ' || t === '#') tiles[y][x] = '+';
}

function line(tiles, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  carve(tiles, x, y);
  while (x !== x1 || y !== y1) {
    if (x !== x1) x += dx;
    else y += dy;
    carve(tiles, x, y);
  }
}

// 2 つの部屋を Z 字の通路でつなぐ(隣接セル同士なので間の隙間を通る)
function connectRooms(tiles, rng, a, b) {
  const ax = rng.int(a.x0 + 1, a.x1 - 1);
  const ay = rng.int(a.y0 + 1, a.y1 - 1);
  const bx = rng.int(b.x0 + 1, b.x1 - 1);
  const by = rng.int(b.y0 + 1, b.y1 - 1);
  if (a.cy === b.cy) {
    const left = a.cx < b.cx ? a : b;
    const right = left === a ? b : a;
    const mid = rng.int(left.x1 + 1, right.x0 - 1);
    const lx = left === a ? ax : bx, ly = left === a ? ay : by;
    const rx = right === a ? ax : bx, ry = right === a ? ay : by;
    line(tiles, lx, ly, mid, ly);
    line(tiles, mid, ly, mid, ry);
    line(tiles, mid, ry, rx, ry);
  } else {
    const top = a.cy < b.cy ? a : b;
    const bottom = top === a ? b : a;
    const mid = rng.int(top.y1 + 1, bottom.y0 - 1);
    const tx = top === a ? ax : bx, ty = top === a ? ay : by;
    const bx2 = bottom === a ? ax : bx, by2 = bottom === a ? ay : by;
    line(tiles, tx, ty, tx, mid);
    line(tiles, tx, mid, bx2, mid);
    line(tiles, bx2, mid, bx2, by2);
  }
}

export function generateFloor(rng) {
  const tiles = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(' '));
  const cells = chooseCells(rng);
  const rooms = cells.map(([cx, cy]) => makeRoom(rng, cx, cy));
  const roomAt = new Map(rooms.map((r) => [`${r.cx},${r.cy}`, r]));

  for (const r of rooms) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
        tiles[y][x] = edge ? '#' : '.';
      }
    }
  }

  // 全域木(ランダム DFS)で必ず全部屋をつなぎ、さらに 1〜2 本の余分な通路で周回できるようにする
  const edges = new Set();
  const key = (a, b) => [a, b].map((r) => `${r.cx},${r.cy}`).sort().join('|');
  const visited = new Set([`${rooms[0].cx},${rooms[0].cy}`]);
  const stack = [rooms[0]];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const next = neighbors([cur.cx, cur.cy])
      .map(([x, y]) => roomAt.get(`${x},${y}`))
      .filter((r) => r && !visited.has(`${r.cx},${r.cy}`));
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const n = rng.pick(next);
    visited.add(`${n.cx},${n.cy}`);
    edges.add(key(cur, n));
    connectRooms(tiles, rng, cur, n);
    stack.push(n);
  }
  const extras = [];
  for (const r of rooms) {
    for (const [x, y] of neighbors([r.cx, r.cy])) {
      const n = roomAt.get(`${x},${y}`);
      if (n && !edges.has(key(r, n)) && !extras.some(([p, q]) => key(p, q) === key(r, n))) extras.push([r, n]);
    }
  }
  for (let i = rng.int(1, 2); i > 0 && extras.length; i--) {
    const [a, b] = extras.splice(rng.int(0, extras.length - 1), 1)[0];
    connectRooms(tiles, rng, a, b);
  }

  // 開始位置と階段は別の部屋に置く
  const startRoom = rng.pick(rooms);
  const stairsRoom = rng.pick(rooms.filter((r) => r !== startRoom));
  const spot = (r) => ({ x: rng.int(r.x0 + 1, r.x1 - 1), y: rng.int(r.y0 + 1, r.y1 - 1) });
  const start = spot(startRoom);
  const stairs = spot(stairsRoom);
  tiles[stairs.y][stairs.x] = '>';

  return { tiles, rooms, start, stairs };
}
