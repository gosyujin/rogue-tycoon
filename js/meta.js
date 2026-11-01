// 街の経営要素: ランをまたいで残る資金・施設・持ち込み品

const KEY = 'rogue-tycoon-meta';

export const KIT_MAX = 5;

export const FACILITIES = {
  inn:   { name: '宿屋',   desc: '初期最大HP +5',          costs: [150, 300, 500, 800, 1200] },
  smith: { name: '武具屋', desc: '初期装備が上等になる',   costs: [300, 600, 1000] },
  shop:  { name: '道具屋', desc: '持ち込み品の品揃えが増える', costs: [200, 400, 800] },
  bank:  { name: '銀行',   desc: '死亡時の持ち帰り率 +10%', costs: [200, 400, 600, 800, 1000] },
};

// unlock: 道具屋のレベルがこれ以上で入荷する
export const GOODS = [
  { kind: 'bread',      price: 40,  unlock: 0 },
  { kind: 'yakusou',    price: 60,  unlock: 0 },
  { kind: 's_map',      price: 120, unlock: 1 },
  { kind: 's_sleep',    price: 120, unlock: 1 },
  { kind: 'ookusa',     price: 150, unlock: 2 },
  { kind: 's_teleport', price: 150, unlock: 2 },
  { kind: 'w_sleep',    price: 250, unlock: 3 },
  { kind: 'w_bolt',     price: 300, unlock: 3 },
];

function fresh() {
  return { v: 1, funds: 0, lv: { inn: 0, smith: 0, shop: 0, bank: 0 }, kit: [] };
}

export function loadMeta() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 1) return { ...fresh(), ...d, lv: { ...fresh().lv, ...d.lv } };
  } catch { /* 無ければ新規 */ }
  return fresh();
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch { /* 保存できない環境では街の成長は残らない */ }
}

export const maxLevel = (id) => FACILITIES[id].costs.length;

// 次のレベルの費用。最大なら null
export function nextCost(meta, id) {
  return FACILITIES[id].costs[meta.lv[id]] ?? null;
}

export function upgrade(meta, id) {
  const cost = nextCost(meta, id);
  if (cost === null) return 'max';
  if (meta.funds < cost) return 'poor';
  meta.funds -= cost;
  meta.lv[id]++;
  saveMeta(meta);
  return 'ok';
}

export function buyGoods(meta, good) {
  if (meta.lv.shop < good.unlock) return 'locked';
  if (meta.kit.length >= KIT_MAX) return 'full';
  if (meta.funds < good.price) return 'poor';
  meta.funds -= good.price;
  meta.kit.push(good.kind);
  saveMeta(meta);
  return 'ok';
}

// ラン開始時の強化: 最大HPの上乗せと、初期装備の等級(0〜3)
export function startBonus(meta) {
  return { hp: meta.lv.inn * 5, tier: Math.min(3, meta.lv.smith) };
}

// ラン終了時に街へ持ち帰る資金。死亡は所持金の一部、踏破は全額 + ボーナス
export function payout(meta, { gold, floor, cleared }) {
  const rate = cleared ? 1 : Math.min(1, 0.5 + 0.1 * meta.lv.bank);
  const amount = Math.floor(gold * rate) + floor * 10 + (cleared ? 500 : 0);
  return { amount, rate };
}
