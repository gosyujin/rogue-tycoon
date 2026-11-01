// 描画: 画面に収まるフォントサイズを計算し、マップを <pre> に色付きで出力する

export const VIEW_W = 21;
export const VIEW_H = 15;

const mapEl = document.getElementById('map');
const boxEl = document.getElementById('map-box');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

// 等幅フォント 1 文字の幅 / 高さの比(1em あたり)を実測する
function measureCharWidth() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:100px/1 ' + getComputedStyle(mapEl).fontFamily;
  probe.textContent = '#'.repeat(20);
  document.body.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 20 / 100;
  probe.remove();
  return w || 0.6;
}

// マップ領域に VIEW_W x VIEW_H が必ず収まるフォントサイズにする
export function fitFont() {
  const cw = measureCharWidth();
  const w = boxEl.clientWidth;
  const h = boxEl.clientHeight;
  const size = Math.floor(Math.min(w / (VIEW_W * cw), h / VIEW_H));
  mapEl.style.fontSize = Math.max(size, 8) + 'px';
}

const CLASS_OF = {
  '#': 'w',
  '.': 'f',
  '@': 'p',
  '>': 'i',
  ' ': 'x',
};

function esc(ch) {
  return ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
}

// rows: 文字列の配列 (VIEW_H 行)
export function drawMap(rows) {
  let html = '';
  for (const row of rows) {
    let cur = null;
    let buf = '';
    for (const ch of row) {
      const cls = CLASS_OF[ch] ?? (/[a-zA-Z]/.test(ch) ? 'm' : 's');
      if (cls !== cur) {
        if (buf) html += `<span class="${cur}">${buf}</span>`;
        cur = cls;
        buf = '';
      }
      buf += esc(ch);
    }
    if (buf) html += `<span class="${cur}">${buf}</span>`;
    html += '\n';
  }
  mapEl.innerHTML = html;
}

export function drawStatus(text) {
  statusEl.textContent = text;
}

export function drawLog(lines) {
  logEl.innerHTML = lines.map((l) => `<div>${l.replace(/[<>&]/g, esc)}</div>`).join('');
}

window.addEventListener('resize', fitFont);
window.addEventListener('orientationchange', fitFont);
