import { VIEW_W, VIEW_H, fitFont, drawMap, drawStatus, drawLog } from './render.js';
import { bindInput } from './input.js';
import { makeRng } from './rng.js';
import { MAP_W, MAP_H, generateFloor, canStep, isWalkable } from './dungeon.js';
import { spawnInitial, spawnOne, summonAround, monsterFromSave } from './monsters.js';
import { TRAPS, spawnTraps } from './traps.js';
import { monstersAct } from './ai.js';
import {
  ITEMS, SYMBOL, INV_MAX, SATIETY_MAX,
  makeLabels, makeItem, itemName, isIdentified, spawnItems,
} from './items.js';
import { openMenu, closeMenu, isMenuOpen } from './menu.js';

const MAX_FLOOR = 30;
const MAX_LV = 30;
const SPAWN_INTERVAL = 50; // このターン数ごとに 1 体、見えない所に追加で出現
const MAX_MONSTERS = 10;
const STAFF_RANGE = 10;
const THROW_RANGE = 8;

const SAVE_KEY = 'rogue-tycoon-save';
const BEST_KEY = 'rogue-tycoon-best';

// ?seed=123 で同じダンジョンを再現できる(指定時はセーブを使わず新規開始)
const urlSeed = Number(new URLSearchParams(location.search).get('seed')) || 0;
const newSeed = () => urlSeed || (Date.now() & 0x7fffffff);

const state = {};
let rng; // 戦闘など実行中の乱数(階層生成とは別)
let aim = null; // 方向入力待ち: { kind: 'staff' | 'throw', item }
let selecting = false; // 識別の巻物で対象を選んでいる間

const name = (it) => itemName(state, it);
const listName = (it) => (it.equipped ? `${name(it)} [E]` : name(it)); // メニュー用: 装備中の印つき

function expForLevel(lv) {
  return Math.round(5 * (lv - 1) ** 2.2);
}

function equipped(type) {
  return state.inv.find((i) => i.equipped && ITEMS[i.kind].type === type);
}

function playerAtk() {
  const w = equipped('weapon');
  return 1 + state.lv + (state.str - 8) + (w ? ITEMS[w.kind].atk + w.plus : 0);
}

function playerDef() {
  const s = equipped('shield');
  return s ? ITEMS[s.kind].def + s.plus : 0;
}

function blankState(seed) {
  Object.assign(state, {
    seed,
    floor: 1,
    turn: 0,
    x: 0, y: 0,
    hp: 30, maxHp: 30, lv: 1, exp: 0, str: 8, gold: 0, kills: 0,
    satiety: SATIETY_MAX,
    dead: false,
    cleared: false,
    log: [],
    map: null,
    seen: null,
    visible: null,
    monsters: [],
    items: [],
    traps: [],
    inv: [],
    identified: new Set(),
    labels: makeLabels(makeRng(seed ^ 0x51ed)),
  });
  rng = makeRng(seed ^ 0x9e3779b9);
  aim = null;
  selecting = false;
  closeMenu();
}

function resetRun() {
  blankState(newSeed());
  state.inv.push(
    { kind: 'sword0', plus: 0, equipped: true },
    { kind: 'shield0', plus: 0, equipped: true },
    { kind: 'bread' },
  );
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
  state.items = spawnItems(genRng, state.floor, state.map);
  state.traps = spawnTraps(genRng, state.floor, state.map, state.items);
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

function itemChar(f) {
  return f.gold ? '$' : SYMBOL[ITEMS[f.item.kind].type];
}

function viewRows() {
  const x0 = Math.max(0, Math.min(MAP_W - VIEW_W, state.x - (VIEW_W >> 1)));
  const y0 = Math.max(0, Math.min(MAP_H - VIEW_H, state.y - (VIEW_H >> 1)));
  const monsterAt = new Map(state.monsters.map((m) => [m.y * MAP_W + m.x, m]));
  const floorItems = new Map(state.items.map((f) => [f.y * MAP_W + f.x, f]));
  const trapAt = new Map(state.traps.filter((t) => t.revealed).map((t) => [t.y * MAP_W + t.x, t]));
  const rows = [];
  for (let y = y0; y < y0 + VIEW_H; y++) {
    let text = '';
    let dim = '';
    for (let x = x0; x < x0 + VIEW_W; x++) {
      const key = y * MAP_W + x;
      const m = monsterAt.get(key);
      const f = floorItems.get(key);
      if (x === state.x && y === state.y) {
        text += '@';
        dim += '0';
      } else if (m && state.visible[y][x]) {
        text += m.ch;
        dim += '0';
      } else if (f && state.seen[y][x]) {
        text += itemChar(f);
        dim += state.visible[y][x] ? '0' : '1';
      } else if (trapAt.has(key) && state.seen[y][x]) {
        text += '^';
        dim += state.visible[y][x] ? '0' : '1';
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
    `G ${state.gold}  満腹 ${Math.ceil(state.satiety / 10)}%  Exp ${state.exp}\n` +
    `攻 ${playerAtk()}  守 ${playerDef()}  力 ${state.str}`
  );
  drawMap(viewRows());
  drawLog(state.log);
  save();
}

const over = () => state.dead || state.cleared;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function recordBest() {
  const best = Math.max(readBest(), state.floor);
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch { /* 保存できない環境では記録しない */ }
  return best;
}

function removeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* 無視 */ }
}

// 階の地形はシードから再生成できるので、変化する部分だけを保存する
function save() {
  if (over()) return;
  const data = {
    v: 1,
    seed: state.seed,
    rngState: rng.getState(),
    ...Object.fromEntries(
      ['floor', 'turn', 'x', 'y', 'hp', 'maxHp', 'lv', 'exp', 'str', 'gold', 'kills', 'satiety', 'log', 'items', 'traps', 'inv', 'labels']
        .map((k) => [k, state[k]])
    ),
    identified: [...state.identified],
    monsters: state.monsters.map((m) => ({ ch: m.ch, hp: m.hp, x: m.x, y: m.y, sleep: m.sleep || 0 })),
    seen: state.seen.map((row) => row.map((b) => (b ? 1 : 0)).join('')),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch { /* 保存できない環境では中断セーブなしで遊ぶ */ }
}

// セーブがあれば復元して true
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.v !== 1) return false;
    blankState(d.seed);
    rng.setState(d.rngState);
    Object.assign(state, {
      floor: d.floor, turn: d.turn, x: d.x, y: d.y, hp: d.hp, maxHp: d.maxHp, lv: d.lv, exp: d.exp,
      str: d.str, gold: d.gold, kills: d.kills, satiety: d.satiety, log: d.log,
      items: d.items, traps: d.traps, inv: d.inv, labels: d.labels,
      identified: new Set(d.identified),
      monsters: d.monsters.map(monsterFromSave),
    });
    state.map = generateFloor(makeRng(state.seed + state.floor * 7919));
    state.seen = d.seen.map((row) => [...row].map((c) => c === '1'));
    updateVisibility();
    return true;
  } catch {
    removeSave();
    return false;
  }
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

function monsterAt(x, y) {
  return state.monsters.find((m) => m.x === x && m.y === y);
}

function floorItemAt(x, y) {
  return state.items.find((f) => f.x === x && f.y === y);
}

// モンスターにダメージを与える。倒したら経験値を得る
function hitMonster(m, dmg, text) {
  m.hp -= dmg;
  m.sleep = 0;
  if (m.hp > 0) {
    say(text);
    return;
  }
  state.monsters = state.monsters.filter((o) => o !== m);
  state.kills++;
  say(`${m.name}を倒した。(Exp ${m.def.exp})`);
  gainExp(m.def.exp);
}

function attackMonster(m) {
  const dmg = damage(playerAtk(), m.def.def);
  hitMonster(m, dmg, `${m.name}に ${dmg} のダメージ。`);
}

function onMonsterAttack(m) {
  const dmg = damage(m.def.atk, playerDef());
  state.hp -= dmg;
  say(`${m.name}の攻撃! ${dmg} のダメージ。`);
}

function showResult(title, cause) {
  const best = recordBest();
  removeSave();
  openMenu({
    title,
    lines: [
      cause,
      '',
      `到達階: ${state.floor}F  (最高 ${best}F)`,
      `レベル ${state.lv}  倒した数 ${state.kills}`,
      `所持金 ${state.gold}G  ${state.turn} ターン`,
    ],
    rows: [{ label: 'もう一度挑戦する', onTap: restart }],
  });
}

function restart() {
  resetRun();
  say('新しい冒険が始まった。');
  render();
}

function die(msg) {
  state.hp = 0;
  state.dead = true;
  aim = null;
  selecting = false;
  say(msg);
  showResult('ゲームオーバー', msg);
}

function clearGame() {
  state.cleared = true;
  say('最深部に到達した!');
  showResult('踏破!', `${MAX_FLOOR} 階の最深部にたどり着いた。`);
}

// プレイヤーの 1 行動が終わった後の世界の更新
function endTurn() {
  monstersAct(state, rng, onMonsterAttack);
  if (state.hp <= 0) {
    die('力尽きた...。');
    return;
  }
  state.turn++;

  state.satiety = Math.max(0, state.satiety - 1);
  if (state.satiety === 200) say('お腹が空いてきた。');
  else if (state.satiety === 100) say('空腹で目が回りそうだ。');
  else if (state.satiety === 0) say('空腹で動けない...。何か食べなければ。');
  if (state.satiety === 0) {
    state.hp--;
    if (state.hp <= 0) {
      die('飢えて力尽きた...。');
      return;
    }
  } else {
    const interval = Math.max(3, 9 - (state.lv >> 1));
    if (state.turn % interval === 0 && state.hp < state.maxHp) state.hp++;
  }

  if (state.turn % SPAWN_INTERVAL === 0 && state.monsters.length < MAX_MONSTERS) {
    const m = spawnOne(rng, state);
    if (m) state.monsters.push(m);
  }
}

// 足元のアイテムを拾う。何かした(拾った/拾えなかった)なら true
function pickupHere() {
  const f = floorItemAt(state.x, state.y);
  if (!f) return false;
  if (f.gold) {
    state.items = state.items.filter((o) => o !== f);
    state.gold += f.gold;
    say(`${f.gold}G を拾った。`);
    return true;
  }
  if (state.inv.length >= INV_MAX) {
    say(`持ち物がいっぱいで ${name(f.item)} を拾えない。`);
    return true;
  }
  state.items = state.items.filter((o) => o !== f);
  state.inv.push(f.item);
  say(`${name(f.item)}を拾った。`);
  return true;
}

// 直線上を進み、最初に当たるモンスターを返す
function traceLine(dx, dy, range) {
  const path = [];
  let x = state.x;
  let y = state.y;
  for (let i = 0; i < range; i++) {
    x += dx;
    y += dy;
    if (!isWalkable(state.map.tiles[y]?.[x] ?? ' ')) break;
    path.push({ x, y });
    const hit = monsterAt(x, y);
    if (hit) return { path, hit };
  }
  return { path, hit: null };
}

function removeItem(it) {
  state.inv = state.inv.filter((i) => i !== it);
}

function fireStaff(it, dx, dy) {
  if (it.charges <= 0) {
    say('杖の魔力は尽きている。');
    return;
  }
  it.charges--;
  const { hit } = traceLine(dx, dy, STAFF_RANGE);
  if (!hit) {
    say('何も起こらなかった。');
    return;
  }
  state.identified.add(it.kind);
  switch (it.kind) {
    case 'w_sleep':
      hit.sleep = 15;
      say(`${hit.name}は眠ってしまった。`);
      break;
    case 'w_blow': {
      let blocked = false;
      for (let i = 0; i < 7; i++) {
        const nx = hit.x + dx;
        const ny = hit.y + dy;
        if (!isWalkable(state.map.tiles[ny]?.[nx] ?? ' ') || monsterAt(nx, ny)) {
          blocked = true;
          break;
        }
        hit.x = nx;
        hit.y = ny;
      }
      if (blocked) hitMonster(hit, 3, `${hit.name}は吹き飛ばされて壁に叩きつけられた。`);
      else say(`${hit.name}は吹き飛ばされた。`);
      break;
    }
    case 'w_bolt': {
      const dmg = 10 + rng.int(0, 3) + (state.lv >> 1);
      hitMonster(hit, dmg, `雷が${hit.name}を撃った! ${dmg} のダメージ。`);
      break;
    }
  }
}

function throwItem(it, dx, dy) {
  removeItem(it);
  it.equipped = false;
  const { path, hit } = traceLine(dx, dy, THROW_RANGE);
  say(`${name(it)}を投げた。`);
  if (hit) {
    const def = ITEMS[it.kind];
    const dmg = def.type === 'weapon' ? def.atk + it.plus : 2;
    hitMonster(hit, dmg, `${hit.name}に当たった。${dmg} のダメージ。`);
  }
  // 飛んだ先(なければ足元)のうち、アイテムも階段もない一番遠いマスに落ちる
  const free = (p) => state.map.tiles[p.y][p.x] !== '>' && !floorItemAt(p.x, p.y);
  const here = { x: state.x, y: state.y };
  const spot = [...path].reverse().find(free) ?? (free(here) ? here : null);
  if (spot) state.items.push({ x: spot.x, y: spot.y, item: it });
  else say('アイテムは消えてしまった。');
}

function teleportRandom() {
  for (let tries = 0; tries < 50; tries++) {
    const r = rng.pick(state.map.rooms);
    const x = rng.int(r.x0 + 1, r.x1 - 1);
    const y = rng.int(r.y0 + 1, r.y1 - 1);
    if (monsterAt(x, y)) continue;
    state.x = x;
    state.y = y;
    break;
  }
  updateVisibility();
}

// 罠を踏んだ。階を移ったり死んだりして、その後のターン処理が不要なら 'stop' を返す
function triggerTrap(t) {
  t.revealed = true;
  say(`${TRAPS[t.kind].name}を踏んだ!`);
  switch (t.kind) {
    case 'pit':
      state.floor++;
      newFloor();
      say(`落とし穴に落ちた! ${state.floor} 階だ。`);
      return 'stop';
    case 'arrow': {
      const dmg = 4 + state.floor;
      state.hp -= dmg;
      state.str = Math.max(3, state.str - 1);
      say(`毒矢が刺さった! ${dmg} のダメージ。力が下がった。`);
      if (state.hp <= 0) {
        die('毒矢に倒れた...。');
        return 'stop';
      }
      return null;
    }
    case 'gas':
      say('眠気に襲われて眠り込んでしまった...。');
      for (let i = 0; i < 5 && !over(); i++) endTurn();
      return over() ? 'stop' : null;
    case 'warp':
      teleportRandom();
      say('別の場所へワープした。');
      return null;
    case 'summon': {
      const n = summonAround(rng, state, 3);
      say(n ? 'モンスターが現れた!' : '何も起こらなかった。');
      return null;
    }
  }
  return null;
}

function readScroll(it) {
  state.identified.add(it.kind);
  removeItem(it);
  switch (it.kind) {
    case 's_map':
      for (const row of state.seen) row.fill(true);
      state.traps.forEach((t) => { t.revealed = true; });
      say('この階の地形と罠が頭に浮かんだ。');
      break;
    case 's_sleep': {
      const targets = state.monsters.filter((m) => state.visible[m.y][m.x]);
      targets.forEach((m) => { m.sleep = 15; });
      say(targets.length ? '周りのモンスターが眠りに落ちた。' : '何も起こらなかった。');
      break;
    }
    case 's_teleport':
      teleportRandom();
      say('体が別の場所へ飛ばされた。');
      break;
    case 's_weapon':
    case 's_shield': {
      const target = equipped(it.kind === 's_weapon' ? 'weapon' : 'shield');
      if (target) {
        target.plus++;
        say(`${name(target)}が輝いた!`);
      } else {
        say('何も起こらなかった。');
      }
      break;
    }
    case 's_identify': {
      const targets = state.inv.filter((i) => !isIdentified(state, i));
      if (!targets.length) {
        say('識別するものがない。');
        break;
      }
      selecting = true;
      openMenu({
        title: '識別するものを選べ',
        rows: targets.map((t) => ({
          label: name(t),
          onTap: () => {
            state.identified.add(t.kind);
            selecting = false;
            closeMenu();
            say(`${name(t)}だった。`);
            endTurn();
            render();
          },
        })),
      });
      return false; // 選択後にターンを消費する
    }
  }
  return true;
}


function toggleEquip(it) {
  const type = ITEMS[it.kind].type;
  if (it.equipped) {
    it.equipped = false;
    say(`${name(it)}を外した。`);
    return;
  }
  state.inv.forEach((i) => {
    if (ITEMS[i.kind].type === type) i.equipped = false;
  });
  it.equipped = true;
  say(`${name(it)}を装備した。`);
}

function useItem(it) {
  closeMenu();
  const def = ITEMS[it.kind];
  let consumeTurn = true;
  switch (def.type) {
    case 'food':
      removeItem(it);
      state.satiety = Math.min(SATIETY_MAX, state.satiety + def.food);
      say(`${def.name}を食べた。お腹が膨れた。`);
      break;
    case 'herb':
      removeItem(it);
      if (def.heal) {
        state.hp = Math.min(state.maxHp, state.hp + def.heal);
        say(`${def.name}を食べた。体力が回復した。`);
      } else if (def.str) {
        state.str += def.str;
        say(`${def.name}を食べた。力が ${state.str} になった。`);
      } else if (def.maxHp) {
        state.maxHp += def.maxHp;
        state.hp = state.maxHp;
        say(`${def.name}を食べた。最大HPが ${state.maxHp} になった。`);
      }
      break;
    case 'scroll':
      consumeTurn = readScroll(it);
      break;
    case 'staff':
      aim = { kind: 'staff', item: it };
      say('どの方向へ? (方向ボタン / ・でやめる)');
      consumeTurn = false;
      break;
    case 'weapon':
    case 'shield':
      toggleEquip(it);
      break;
  }
  if (consumeTurn) endTurn();
  render();
}

function startThrow(it) {
  closeMenu();
  aim = { kind: 'throw', item: it };
  say('どの方向へ投げる? (方向ボタン / ・でやめる)');
  render();
}

function dropItem(it) {
  closeMenu();
  if (state.map.tiles[state.y][state.x] === '>') {
    say('階段の上には置けない。');
  } else if (floorItemAt(state.x, state.y)) {
    say('足元にはすでに何かある。');
  } else {
    removeItem(it);
    it.equipped = false;
    state.items.push({ x: state.x, y: state.y, item: it });
    say(`${name(it)}を置いた。`);
    endTurn();
  }
  render();
}

const USE_LABEL = { food: '食べる', herb: '食べる', scroll: '読む', staff: '振る' };

function openItemMenu(it) {
  const type = ITEMS[it.kind].type;
  const useLabel = type === 'weapon' || type === 'shield'
    ? (it.equipped ? '外す' : '装備する')
    : USE_LABEL[type];
  openMenu({
    title: listName(it),
    rows: [
      { label: useLabel, onTap: () => useItem(it) },
      { label: '投げる', onTap: () => startThrow(it) },
      { label: '置く', onTap: () => dropItem(it) },
    ],
    back: { label: '戻る', onTap: openInventory },
  });
}

function openInventory() {
  if (!state.inv.length) {
    say('持ち物は空だ。');
    render();
    return;
  }
  openMenu({
    title: `持ち物 (${state.inv.length}/${INV_MAX})`,
    rows: state.inv.map((it, i) => ({ label: `${i + 1}. ${listName(it)}`, onTap: () => openItemMenu(it) })),
    back: { label: '閉じる', onTap: closeMenu },
  });
}

function onMove(dx, dy) {
  if (over() || selecting) return;
  if (aim) {
    const a = aim;
    aim = null;
    if (!dx && !dy) {
      say('やめた。');
    } else {
      if (a.kind === 'staff') fireStaff(a.item, dx, dy);
      else throwItem(a.item, dx, dy);
      endTurn();
    }
    render();
    return;
  }
  if (isMenuOpen()) return;
  if (dx === 0 && dy === 0) {
    say('足踏みした。');
  } else {
    // 斜めは壁の角をまたげない(トルネコ準拠)。攻撃も同じ
    if (!canStep(state.map.tiles, state.x, state.y, dx, dy)) return;
    const nx = state.x + dx;
    const ny = state.y + dy;
    const target = monsterAt(nx, ny);
    if (target) {
      attackMonster(target);
    } else {
      state.x = nx;
      state.y = ny;
      updateVisibility();
      const trap = state.traps.find((t) => t.x === nx && t.y === ny);
      if (trap) {
        if (triggerTrap(trap) === 'stop') {
          render();
          return;
        }
      } else if (!pickupHere() && state.map.tiles[ny][nx] === '>') {
        say('階段がある。');
      }
    }
  }
  endTurn();
  render();
}

function descend() {
  if (state.floor >= MAX_FLOOR) {
    clearGame();
    return;
  }
  state.floor++;
  say(`${state.floor} 階に降りた。`);
  newFloor();
}

function onAction(act) {
  if (over()) return; // 結果画面の「もう一度挑戦する」だけが操作できる
  if (selecting) return;
  if (aim) {
    aim = null;
    say('やめた。');
    render();
    return;
  }
  if (act === 'items') {
    if (isMenuOpen()) closeMenu();
    else openInventory();
    render();
    return;
  }
  if (isMenuOpen()) closeMenu();
  if (act === 'floor') {
    if (floorItemAt(state.x, state.y)) {
      if (pickupHere()) endTurn();
    } else if (state.map.tiles[state.y][state.x] === '>') {
      descend();
    } else {
      say('足元には何もない。');
    }
  }
  render();
}

bindInput({ onMove, onAction });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isMenuOpen() && !selecting && !over()) closeMenu();
});
fitFont();
if (urlSeed || !load()) {
  resetRun();
  say('ようこそ、rogue-tycoon へ。');
} else {
  say('冒険を再開した。');
}
render();

// デバッグ・検証用(コンソールから状態を覗ける)
window.__game = {
  state, newFloor, render, onMove, onAction,
  give: (kind) => state.inv.push(makeItem(rng, kind, state.floor)),
};
