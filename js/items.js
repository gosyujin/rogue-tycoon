// アイテム定義・名前・床への配置

export const INV_MAX = 20;
export const SATIETY_MAX = 1000; // 表示は 1/10 (100%)

// type: food / herb / scroll / staff / weapon / shield
export const ITEMS = {
  // 食料(food は満腹度 1000 = 100%)
  bread:   { type: 'food', name: 'パン', food: 500 },
  onigiri: { type: 'food', name: 'おにぎり', food: 300 },
  // 薬草
  yakusou: { type: 'herb', name: '薬草', heal: 25 },
  ookusa:  { type: 'herb', name: '大薬草', heal: 60 },
  chikara: { type: 'herb', name: '力の種', str: 1 },
  inochi:  { type: 'herb', name: '命の草', maxHp: 5 },
  // 巻物(未識別の間は名前が伏せられる)
  s_identify: { type: 'scroll', name: '識別' },
  s_map:      { type: 'scroll', name: 'マップ' },
  s_sleep:    { type: 'scroll', name: '眠り' },
  s_teleport: { type: 'scroll', name: '瞬間移動' },
  s_weapon:   { type: 'scroll', name: '武器強化' },
  s_shield:   { type: 'scroll', name: '盾強化' },
  // 杖(方向を選んで振る。回数制限あり)
  w_sleep: { type: 'staff', name: '眠り' },
  w_blow:  { type: 'staff', name: 'ふっとばし' },
  w_bolt:  { type: 'staff', name: '雷' },
  // 武器(atk)と盾(def)
  sword0: { type: 'weapon', name: '銅の剣', atk: 3, tier: 0 },
  sword1: { type: 'weapon', name: '鉄の剣', atk: 5, tier: 1 },
  sword2: { type: 'weapon', name: '鋼の剣', atk: 8, tier: 2 },
  sword3: { type: 'weapon', name: 'ミスリルの剣', atk: 12, tier: 3 },
  shield0: { type: 'shield', name: '木の盾', def: 1, tier: 0 },
  shield1: { type: 'shield', name: '銅の盾', def: 2, tier: 1 },
  shield2: { type: 'shield', name: '鉄の盾', def: 4, tier: 2 },
  shield3: { type: 'shield', name: '鋼の盾', def: 6, tier: 3 },
};

export const SYMBOL = {
  food: '%', herb: '!', scroll: '?', staff: '/', weapon: ')', shield: '[',
};

const SCROLL_LABELS = ['ケモナ', 'ルビエ', 'ヒゾラ', 'ネクト', 'アモリ', 'ズガン', 'ミカセ', 'ポルタ'];
const STAFF_LABELS = ['樫', '楓', '柊', '桜', '欅', '檜'];

function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ラン開始時に、未識別アイテムの仮の名前を割り当てる
export function makeLabels(rng) {
  const labels = {};
  const scrolls = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'scroll');
  const staffs = Object.keys(ITEMS).filter((k) => ITEMS[k].type === 'staff');
  shuffle(rng, SCROLL_LABELS).forEach((l, i) => { if (scrolls[i]) labels[scrolls[i]] = l; });
  shuffle(rng, STAFF_LABELS).forEach((l, i) => { if (staffs[i]) labels[staffs[i]] = l; });
  return labels;
}

export function isIdentified(state, it) {
  const type = ITEMS[it.kind].type;
  return (type !== 'scroll' && type !== 'staff') || state.identified.has(it.kind);
}

export function itemName(state, it) {
  const def = ITEMS[it.kind];
  const known = isIdentified(state, it);
  let name;
  switch (def.type) {
    case 'scroll':
      name = known ? `${def.name}の巻物` : `「${state.labels[it.kind]}」の巻物`;
      break;
    case 'staff':
      name = (known ? `${def.name}の杖` : `${state.labels[it.kind]}の杖`) + (known ? `[${it.charges}]` : '');
      break;
    case 'weapon':
    case 'shield':
      name = def.name + (it.plus ? `${it.plus > 0 ? '+' : ''}${it.plus}` : '');
      break;
    default:
      name = def.name;
  }
  return name;
}

export function makeItem(rng, kind, floor = 1) {
  const def = ITEMS[kind];
  const it = { kind };
  if (def.type === 'staff') it.charges = rng.int(3, 5);
  if (def.type === 'weapon' || def.type === 'shield') {
    it.plus = rng.next() < 0.2 ? rng.int(1, 1 + Math.floor(floor / 10)) : 0;
  }
  return it;
}

function weighted(rng, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r < 0) return v;
  }
  return table[table.length - 1][0];
}

const TYPE_WEIGHTS = [['food', 18], ['herb', 26], ['scroll', 22], ['staff', 8], ['weapon', 11], ['shield', 11]];

function rollKind(rng, floor) {
  const type = weighted(rng, TYPE_WEIGHTS);
  const tier = Math.max(0, Math.min(3, Math.floor(floor / 8) + rng.int(-1, 1)));
  switch (type) {
    case 'food': return weighted(rng, [['bread', 40], ['onigiri', 60]]);
    case 'herb': return weighted(rng, [['yakusou', 50], ['ookusa', floor >= 4 ? 20 : 0], ['chikara', 15], ['inochi', 15]]);
    case 'scroll': return weighted(rng, [['s_identify', 25], ['s_map', 15], ['s_sleep', 15], ['s_teleport', 15], ['s_weapon', 15], ['s_shield', 15]]);
    case 'staff': return weighted(rng, [['w_sleep', 35], ['w_blow', 35], ['w_bolt', 30]]);
    case 'weapon': return `sword${tier}`;
    default: return `shield${tier}`;
  }
}

// 階の生成直後に床へ配置する: アイテム 3〜6 個 + 金貨 1〜3 山(階段の上には置かない)
export function spawnItems(rng, floor, map) {
  const out = [];
  const taken = new Set();
  const place = () => {
    for (let tries = 0; tries < 30; tries++) {
      const r = rng.pick(map.rooms);
      const x = rng.int(r.x0 + 1, r.x1 - 1);
      const y = rng.int(r.y0 + 1, r.y1 - 1);
      const key = `${x},${y}`;
      if (taken.has(key) || map.tiles[y][x] === '>') continue;
      taken.add(key);
      return { x, y };
    }
    return null;
  };
  for (let i = rng.int(3, 6); i > 0; i--) {
    const p = place();
    if (p) out.push({ ...p, item: makeItem(rng, rollKind(rng, floor), floor) });
  }
  for (let i = rng.int(1, 3); i > 0; i--) {
    const p = place();
    if (p) out.push({ ...p, gold: rng.int(10, 30) + floor * 8 });
  }
  return out;
}
