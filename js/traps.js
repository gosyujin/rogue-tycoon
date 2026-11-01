// 罠: 踏むか「マップ」の巻物で見えるようになる

export const TRAPS = {
  pit:    { name: '落とし穴' },
  arrow:  { name: '毒矢の罠' },
  gas:    { name: '睡眠ガスの罠' },
  warp:   { name: 'ワープの罠' },
  summon: { name: '召喚の罠' },
};

// 2 階から出現。階段・アイテム・開始位置の上には置かない
export function spawnTraps(rng, floor, map, items) {
  if (floor < 2) return [];
  const kinds = Object.keys(TRAPS).filter((k) => !(k === 'pit' && floor >= 30));
  const taken = new Set(items.map((f) => `${f.x},${f.y}`));
  taken.add(`${map.start.x},${map.start.y}`);
  const traps = [];
  for (let i = rng.int(0, 3); i > 0; i--) {
    for (let tries = 0; tries < 20; tries++) {
      const r = rng.pick(map.rooms);
      const x = rng.int(r.x0 + 1, r.x1 - 1);
      const y = rng.int(r.y0 + 1, r.y1 - 1);
      const key = `${x},${y}`;
      if (taken.has(key) || map.tiles[y][x] === '>') continue;
      taken.add(key);
      traps.push({ x, y, kind: rng.pick(kinds), revealed: false });
      break;
    }
  }
  return traps;
}
