// 入力: 画面ボタンとキーボードを「移動 / アクション」コールバックに変換する

const KEY_DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  '.': [0, 0],
};

const KEY_ACTS = {
  i: 'items',
  g: 'floor',
  Enter: 'floor',
};

export function bindInput({ onMove, onAction }) {
  document.querySelectorAll('[data-dir]').forEach((btn) => {
    const [dx, dy] = btn.dataset.dir.split(',').map(Number);
    btn.addEventListener('click', () => onMove(dx, dy));
  });
  document.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => onAction(btn.dataset.act));
  });
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key in KEY_DIRS) {
      const [dx, dy] = KEY_DIRS[e.key];
      onMove(dx, dy);
      e.preventDefault();
    } else if (e.key in KEY_ACTS) {
      onAction(KEY_ACTS[e.key]);
      e.preventDefault();
    }
  });
}
