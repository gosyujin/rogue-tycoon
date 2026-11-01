import { VIEW_W, VIEW_H, fitFont, drawMap, drawStatus, drawLog } from './render.js';
import { bindInput } from './input.js';
import { makeRng } from './rng.js';
import { MAP_W, MAP_H, generateFloor, canStep } from './dungeon.js';
import { spawnInitial, spawnOne } from './monsters.js';
import { monstersAct } from './ai.js';

const MAX_FLOOR = 30;
const MAX_LV = 30;
const SPAWN_INTERVAL = 50; // このターン数ごとに 1 体、見えない所に追加で出現
const MAX_MONSTERS = 10;

// ?seed=123 で同じダンジョンを再現できる
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff);

const state = {};
let rng; // 戦闘など実行中の乱数(階層生成とは別)

function expForLevel(lv) {
  return Math.round(5 * (lv - 1) ** 2.2);
}

function playerAtk() {
  return 2 + state.lv;
}

function playerDef() {
  return 0;
}

function resetRun() {
  Object.assign(state, {
    seed,
    floor: 1,
    turn: 0,
    x: 0, y: 0,
    hp: 30, maxHp: 30, lv: 1, exp: 0, gold: 0, food: 100,
    dead: false,
    log: [],
    map: null,
    seen: null,
    visible: null,
    monsters: [],
  });
  rng = makeRng(seed ^ 0x9e3779b9);
  newFloor();
}

function say(msg) {
  state.log.unshift(msg);
  state.log.length = Math.min(state.log.length, 3);
}

function newFloor() {
  const genRng = makeRng(state.seed + state.floor * 7919);
  state.map = generateFloor(genRng);
  state.monsters = spawnInitial(genRng, state.floor, state.map);
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
  const monsterAt = new Map(state.monsters.map((m) => [m.y * MAP_W + m.x, m]));
  const rows = [];
  for (let y = y0; y < y0 + VIEW_H; y++) {
    let text = '';
    let dim = '';
    for (let x = x0; x < x0 + VIEW_W; x++) {
      const m = monsterAt.get(y * MAP_W + x);
      if (x === state.x && y === state.y) {
        text += '@';
        dim += '0';
      } else if (m && state.visible[y][x]) {
        text += m.ch;
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
    `G ${state.gold}  満腹 ${state.food}%  Exp ${state.exp}`
  );
  drawMap(viewRows());
  drawLog(state.log);
}

function damage(atk, def) {
  return Math.max(1, atk + rng.int(-1, 1) - def);
}

function gainExp(n) {
  state.exp += n;
  while (state.lv < MAX_LV && state.exp >= expForLevel(state.lv + 1)) {
    state.lv++;
    state.maxHp += 5;
    state.hp = Math.min(state.maxHp, state.hp + 5);
    say(`レベルが ${state.lv} に上がった!`);
  }
}

function attackMonster(m) {
  const dmg = damage(playerAtk(), m.def.def);
  m.hp -= dmg;
  if (m.hp > 0) {
    say(`${m.name}に ${dmg} のダメージ。`);
    return;
  }
  state.monsters = state.monsters.filter((o) => o !== m);
  say(`${m.name}を倒した。(Exp ${m.def.exp})`);
  gainExp(m.def.exp);
}

function onMonsterAttack(m) {
  const dmg = damage(m.def.atk, playerDef());
  state.hp -= dmg;
  say(`${m.name}の攻撃! ${dmg} のダメージ。`);
}

// プレイヤーの 1 行動が終わった後の世界の更新
function endTurn() {
  monstersAct(state, rng, onMonsterAttack);
  if (state.hp <= 0) {
    state.hp = 0;
    state.dead = true;
    say('力尽きた...。「足元」で最初からやり直す。');
    return;
  }
  state.turn++;
  const interval = Math.max(3, 9 - (state.lv >> 1));
  if (state.turn % interval === 0 && state.hp < state.maxHp) state.hp++;
  if (state.turn % SPAWN_INTERVAL === 0 && state.monsters.length < MAX_MONSTERS) {
    const m = spawnOne(rng, state);
    if (m) state.monsters.push(m);
  }
}

function onMove(dx, dy) {
  if (state.dead) return;
  if (dx === 0 && dy === 0) {
    say('足踏みした。');
  } else {
    // 斜めは壁の角をまたげない(トルネコ準拠)。攻撃も同じ
    if (!canStep(state.map.tiles, state.x, state.y, dx, dy)) return;
    const nx = state.x + dx;
    const ny = state.y + dy;
    const target = state.monsters.find((m) => m.x === nx && m.y === ny);
    if (target) {
      attackMonster(target);
    } else {
      state.x = nx;
      state.y = ny;
      updateVisibility();
      if (state.map.tiles[ny][nx] === '>') say('階段がある。');
    }
  }
  endTurn();
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
  if (state.dead) {
    if (act === 'floor') {
      resetRun();
      say('新しい冒険が始まった。');
    }
    render();
    return;
  }
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
resetRun();
say('ようこそ、rogue-tycoon へ。');
render();

// デバッグ・検証用(コンソールから状態を覗ける)
window.__game = { state, newFloor, render, onMove };
