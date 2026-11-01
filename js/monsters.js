// モンスター定義と出現

import { isWalkable } from './dungeon.js';

// minFl〜maxFl の階に出現。erratic は不規則に動く
export const MONSTERS = [
  { ch: 's', name: 'スライム',   hp: 6,   atk: 2,  def: 0, exp: 3,   minFl: 1,  maxFl: 5 },
  { ch: 'r', name: 'ネズミ',     hp: 5,   atk: 3,  def: 0, exp: 4,   minFl: 1,  maxFl: 6 },
  { ch: 'b', name: 'コウモリ',   hp: 7,   atk: 3,  def: 0, exp: 6,   minFl: 2,  maxFl: 8, erratic: true },
  { ch: 'g', name: 'ゴブリン',   hp: 14,  atk: 5,  def: 1, exp: 12,  minFl: 3,  maxFl: 12 },
  { ch: 'k', name: 'スケルトン', hp: 18,  atk: 7,  def: 2, exp: 20,  minFl: 6,  maxFl: 16 },
  { ch: 'S', name: '大蛇',       hp: 20,  atk: 7,  def: 1, exp: 24,  minFl: 7,  maxFl: 18 },
  { ch: 't', name: '盗賊',       hp: 16,  atk: 6,  def: 1, exp: 22,  minFl: 8,  maxFl: 18 },
  { ch: 'z', name: 'ゾンビ',     hp: 40,  atk: 11, def: 2, exp: 45,  minFl: 10, maxFl: 22 },
  { ch: 'G', name: 'ゴースト',   hp: 25,  atk: 9,  def: 3, exp: 40,  minFl: 12, maxFl: 24 },
  { ch: 'm', name: '魔法使い',   hp: 22,  atk: 10, def: 2, exp: 55,  minFl: 14, maxFl: 26 },
  { ch: 'O', name: 'オーガ',     hp: 45,  atk: 14, def: 4, exp: 70,  minFl: 15, maxFl: 28 },
  { ch: 'D', name: 'ドラゴン',   hp: 120, atk: 24, def: 8, exp: 300, minFl: 24, maxFl: 30 },
];

function makeMonster(def, x, y) {
  return { def, name: def.name, ch: def.ch, hp: def.hp, x, y };
}

// セーブデータからの復元(定義は ch で引く)
export function monsterFromSave(s) {
  const def = MONSTERS.find((d) => d.ch === s.ch);
  return { ...makeMonster(def, s.x, s.y), hp: s.hp, sleep: s.sleep || 0 };
}

// 召喚の罠: プレイヤーの周囲の空きマスに最大 n 体を出現させる
export function summonAround(rng, state, n) {
  const spots = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = state.x + dx;
      const y = state.y + dy;
      if ((dx || dy) && isWalkable(state.map.tiles[y]?.[x] ?? ' ') &&
          !state.monsters.some((m) => m.x === x && m.y === y)) spots.push({ x, y });
    }
  }
  const pool = candidates(state.floor);
  let count = 0;
  while (count < n && spots.length) {
    const p = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    state.monsters.push(makeMonster(rng.pick(pool), p.x, p.y));
    count++;
  }
  return count;
}

function candidates(floor) {
  return MONSTERS.filter((d) => floor >= d.minFl && floor <= d.maxFl);
}

function randomFloorSpot(rng, rooms) {
  const r = rng.pick(rooms);
  return { x: rng.int(r.x0 + 1, r.x1 - 1), y: rng.int(r.y0 + 1, r.y1 - 1), room: r };
}

// 階の生成直後に配置する(開始部屋には置かない)
export function spawnInitial(rng, floor, map) {
  const pool = candidates(floor);
  const monsters = [];
  const rooms = map.rooms.filter((r) => !(
    map.start.x >= r.x0 && map.start.x <= r.x1 && map.start.y >= r.y0 && map.start.y <= r.y1
  ));
  const count = rng.int(3, 8);
  for (let i = 0; i < count; i++) {
    const p = randomFloorSpot(rng, rooms);
    if (monsters.some((m) => m.x === p.x && m.y === p.y)) continue;
    monsters.push(makeMonster(rng.pick(pool), p.x, p.y));
  }
  return monsters;
}

// 探索中の追加出現: プレイヤーから見えない場所に 1 体
export function spawnOne(rng, state) {
  const pool = candidates(state.floor);
  for (let tries = 0; tries < 20; tries++) {
    const p = randomFloorSpot(rng, state.map.rooms);
    if (state.visible[p.y][p.x]) continue;
    if (state.monsters.some((m) => m.x === p.x && m.y === p.y)) continue;
    if (p.x === state.x && p.y === state.y) continue;
    return makeMonster(rng.pick(pool), p.x, p.y);
  }
  return null;
}
