import { VIEW_W, VIEW_H, fitFont, drawMap, drawStatus, drawLog } from './render.js';
import { bindInput } from './input.js';
import { makeRng } from './rng.js';
import { MAP_W, MAP_H, generateFloor, isWalkable } from './dungeon.js';

const MAX_FLOOR = 30;

// ?seed=123 で同じダンジョンを再現できる
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);

const state = {
  seed,
  floor: 1,
  x: 0, y: 0,
  hp: 30, maxHp: 30, lv: 1, gold: 0, food: 100,
  log: [],
  map: null,        // generateFloor の結果
  seen: null,       // 一度でも見えたマス
  visible: null,    // 今見えているマス
};

function say(msg) {
  state.log.unshift(msg);
  state.log.length = Math.min(state.log.length, 3);
}

function newFloor() {
  const rng = makeRng(state.seed + state.floor * 7919);
  state.map = generateFloor(rng);
  state.x = state.map.start.x;
  state.y = state.map.start.y;
  state.seen = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  updateVisibility();
}

// 視界: 部屋の中なら部屋全体(壁・出入口を含む)、それ以外は周囲 1 マス
function updateVisibility() {
  const vis = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false));
  const mark = (x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(MAP_H - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(MAP_W - 1, x1); x++) vis[y][x] = true;
    }
  };
  mark(state.x - 1, state.y - 1, state.x + 1, state.y + 1);
  for (const r of state.map.rooms) {
    if (state.x >= r.x0 && state.x <= r.x1 && state.y >= r.y0 && state.y <= r.y1) {
      mark(r.x0, r.y0, r.x1, r.y1);
    }
  }
  state.visible = vis;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) if (vis[y][x]) state.seen[y][x] = true;
  }
}

function viewRows() {
  const x0 = Math.max(0, Math.min(MAP_W - VIEW_W, state.x - (VIEW_W >> 1)));
  const y0 = Math.max(0, Math.min(MAP_H - VIEW_H, state.y - (VIEW_H >> 1)));
  const rows = [];
  for (let y = y0; y < y0 + VIEW_H; y++) {
    let text = '';
    let dim = '';
    for (let x = x0; x < x0 + VIEW_W; x++) {
      if (x === state.x && y === state.y) {
        text += '@';
        dim += '0';
      } else if (state.seen[y][x]) {
        text += state.map.tiles[y][x];
        dim += state.visible[y][x] ? '0' : '1';
      } else {
        text += ' ';
        dim += '0';
      }
    }
    rows.push({ text, dim });
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
  return isWalkable(state.map.tiles[y]?.[x] ?? ' ');
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
    if (!walkable(nx, ny) || cornerBlocked) return;
    state.x = nx;
    state.y = ny;
    updateVisibility();
    if (state.map.tiles[ny][nx] === '>') say('階段がある。');
  }
  render();
}

function descend() {
  if (state.floor >= MAX_FLOOR) {
    say('最深部に到達した!(クリア演出は M5 で追加)');
    return;
  }
  state.floor++;
  say(`${state.floor} 階に降りた。`);
  newFloor();
}

function onAction(act) {
  if (act === 'floor') {
    if (state.map.tiles[state.y][state.x] === '>') descend();
    else say('足元には何もない。');
  } else if (act === 'items') {
    say('持ち物は空だ。');
  }
  render();
}

bindInput({ onMove, onAction });
fitFont();
newFloor();
say('ようこそ、rogue-tycoon へ。');
render();

// デバッグ・検証用(コンソールから状態を覗ける)
window.__game = { state, newFloor, render };
