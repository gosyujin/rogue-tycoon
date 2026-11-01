import { VIEW_W, VIEW_H, fitFont, drawMap, drawStatus, drawLog } from './render.js';
import { bindInput } from './input.js';

// M1: 描画基盤の確認用に固定マップ(48x24)を置いている。M2 で階層生成に置き換える。
const MAP_W = 48;
const MAP_H = 24;

function buildTestMap() {
  const m = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(' '));
  const room = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || y === y0 || y === y1;
        m[y][x] = edge ? '#' : '.';
      }
    }
  };
  room(2, 2, 20, 10);
  room(28, 4, 45, 14);
  room(8, 15, 26, 22);
  const carve = (x, y) => { m[y][x] = '.'; };
  for (let x = 20; x <= 28; x++) carve(x, 6);
  for (let y = 10; y <= 15; y++) carve(14, y);
  m[19][24] = '>';
  return m;
}

const map = buildTestMap();
const state = {
  x: 5, y: 5,
  hp: 30, maxHp: 30, lv: 1, floor: 1, gold: 0, food: 100,
  log: ['ようこそ、rogue-tycoon へ。'],
};

function say(msg) {
  state.log.unshift(msg);
  state.log.length = Math.min(state.log.length, 3);
}

function viewRows() {
  const x0 = Math.max(0, Math.min(MAP_W - VIEW_W, state.x - (VIEW_W >> 1)));
  const y0 = Math.max(0, Math.min(MAP_H - VIEW_H, state.y - (VIEW_H >> 1)));
  const rows = [];
  for (let y = y0; y < y0 + VIEW_H; y++) {
    let row = '';
    for (let x = x0; x < x0 + VIEW_W; x++) {
      row += x === state.x && y === state.y ? '@' : map[y][x];
    }
    rows.push(row);
  }
  return rows;
}

function render() {
  drawStatus(
    `Fl ${state.floor}  Lv ${state.lv}  HP ${state.hp}/${state.maxHp}\n` +
    `G ${state.gold}  満腹 ${state.food}%`
  );
  drawMap(viewRows());
  drawLog(state.log);
}

function walkable(x, y) {
  return map[y]?.[x] === '.' || map[y]?.[x] === '>';
}

function onMove(dx, dy) {
  if (dx === 0 && dy === 0) {
    say('足踏みした。');
  } else {
    const nx = state.x + dx;
    const ny = state.y + dy;
    // 斜め移動は壁の角をまたげない(トルネコ準拠)
    const cornerBlocked = dx !== 0 && dy !== 0 &&
      (!walkable(state.x + dx, state.y) || !walkable(state.x, state.y + dy));
    if (walkable(nx, ny) && !cornerBlocked) {
      state.x = nx;
      state.y = ny;
    } else {
      return;
    }
  }
  render();
}

function onAction(act) {
  if (act === 'floor') {
    if (map[state.y][state.x] === '>') say('階段がある。(M2 で降りられるようになる)');
    else say('足元には何もない。');
  } else if (act === 'items') {
    say('持ち物は空だ。');
  }
  render();
}

bindInput({ onMove, onAction });
fitFont();
render();
