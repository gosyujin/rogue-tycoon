// モンスターの行動: プレイヤーからの距離マップを使って追跡・攻撃する

import { MAP_W, MAP_H, canStep } from './dungeon.js';

const DIRS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

const NOTICE_DIST = 9; // この歩数以内ならプレイヤーに気づいて追ってくる

// プレイヤー位置からの歩数(斜めの角ルール込み)。遠いマスは Infinity のまま
function distanceMap(tiles, px, py) {
  const dist = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(Infinity));
  dist[py][px] = 0;
  const queue = [[px, py]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (dist[y][x] >= NOTICE_DIST) continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (dist[ny]?.[nx] !== Infinity || !canStep(tiles, x, y, dx, dy)) continue;
      dist[ny][nx] = dist[y][x] + 1;
      queue.push([nx, ny]);
    }
  }
  return dist;
}

// 全モンスターが 1 回ずつ行動する。攻撃時は onAttack(monster) を呼ぶ
export function monstersAct(state, rng, onAttack) {
  const { tiles } = state.map;
  const dist = distanceMap(tiles, state.x, state.y);
  const occupied = new Set(state.monsters.map((m) => m.y * MAP_W + m.x));
  const free = (x, y) => !occupied.has(y * MAP_W + x) && !(x === state.x && y === state.y);

  for (const m of state.monsters) {
    if (m.sleep > 0) {
      m.sleep--;
      continue;
    }
    const d = dist[m.y][m.x];
    const dx = state.x - m.x;
    const dy = state.y - m.y;
    // 隣接していれば攻撃(斜めは角ルールに従う)
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && canStep(tiles, m.x, m.y, dx, dy)) {
      onAttack(m);
      continue;
    }

    const chasing = d !== Infinity && !(m.def.erratic && rng.next() < 0.5);
    let step = null;
    if (chasing) {
      let best = d;
      const options = [];
      for (const [sx, sy] of DIRS) {
        const nx = m.x + sx;
        const ny = m.y + sy;
        if (!canStep(tiles, m.x, m.y, sx, sy) || !free(nx, ny)) continue;
        if (dist[ny][nx] < best) {
          best = dist[ny][nx];
          options.length = 0;
        }
        if (dist[ny][nx] === best && best < d) options.push([sx, sy]);
      }
      if (options.length) step = rng.pick(options);
    } else if (d === Infinity ? rng.next() < 0.3 : true) {
      // 気づいていない時はたまに、コウモリは気まぐれにうろつく
      const options = DIRS.filter(([sx, sy]) => canStep(tiles, m.x, m.y, sx, sy) && free(m.x + sx, m.y + sy));
      if (options.length) step = rng.pick(options);
    }

    if (step) {
      occupied.delete(m.y * MAP_W + m.x);
      m.x += step[0];
      m.y += step[1];
      occupied.add(m.y * MAP_W + m.x);
    }
  }
}
