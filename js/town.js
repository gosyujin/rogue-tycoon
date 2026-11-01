// 街の画面(メニューを使った ASCII の簡易 UI)

import { openMenu } from './menu.js';
import { ITEMS } from './items.js';
import { FACILITIES, GOODS, KIT_MAX, maxLevel, nextCost, upgrade, buyGoods } from './meta.js';

const ART = [
  '   ^^    __    ^^',
  '  /__\\  |..|  /__\\',
  '  |[]|  |[]|  |[]|',
  ' ~~~~~~~~~~~~~~~~~~',
];

function goodsName(kind) {
  const def = ITEMS[kind];
  if (def.type === 'scroll') return `${def.name}の巻物`;
  if (def.type === 'staff') return `${def.name}の杖`;
  return def.name;
}

const kitLine = (meta) =>
  `持ち込み(${meta.kit.length}/${KIT_MAX}): ${meta.kit.length ? meta.kit.map(goodsName).join('、') : 'なし'}`;

const RESULT_TEXT = {
  poor: '資金が足りない。',
  full: '持ち込める数の上限だ。',
  locked: 'まだ入荷していない。',
  max: 'これ以上は強化できない。',
};

// onStart: 「冒険に出る」が押されたときの処理
export function openTown(meta, onStart, message = '') {
  openMenu({
    title: '街',
    lines: [...ART, `資金 ${meta.funds}G`, kitLine(meta), message].filter((l) => l !== ''),
    rows: [
      { label: '冒険に出る', onTap: onStart },
      { label: '施設を強化する', onTap: () => openFacilities(meta, onStart) },
      { label: '道具屋で買い物', onTap: () => openShop(meta, onStart) },
    ],
  });
}

function openFacilities(meta, onStart, message = '') {
  const rows = Object.entries(FACILITIES).map(([id, f]) => {
    const lv = meta.lv[id];
    const cost = nextCost(meta, id);
    const label = cost === null
      ? `${f.name} Lv${lv}/${maxLevel(id)} (最大) ${f.desc}`
      : `${f.name} Lv${lv}/${maxLevel(id)} ${f.desc} → ${cost}G`;
    return {
      label,
      onTap: () => {
        const r = upgrade(meta, id);
        openFacilities(meta, onStart, r === 'ok' ? `${f.name}を強化した。` : RESULT_TEXT[r]);
      },
    };
  });
  openMenu({
    title: '施設を強化する',
    lines: [`資金 ${meta.funds}G`, message].filter((l) => l !== ''),
    rows,
    back: { label: '街へ戻る', onTap: () => openTown(meta, onStart) },
  });
}

function openShop(meta, onStart, message = '') {
  const rows = GOODS.map((g) => {
    const open = meta.lv.shop >= g.unlock;
    return {
      label: open ? `${goodsName(g.kind)} ${g.price}G` : `？？？ (道具屋 Lv${g.unlock} で入荷)`,
      onTap: () => {
        const r = buyGoods(meta, g);
        openShop(meta, onStart, r === 'ok' ? `${goodsName(g.kind)}を買った。` : RESULT_TEXT[r]);
      },
    };
  });
  openMenu({
    title: '道具屋',
    lines: [`資金 ${meta.funds}G`, kitLine(meta), message].filter((l) => l !== ''),
    rows,
    back: { label: '街へ戻る', onTap: () => openTown(meta, onStart) },
  });
}
