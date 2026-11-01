// 持ち物メニュー(マップ領域に重ねて表示する)

const el = document.getElementById('menu');

// rows: [{ label, onTap }], back: { label, onTap }
export function openMenu({ title, rows, back, lines = [] }) {
  el.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'menu-title';
  head.textContent = title;
  el.appendChild(head);
  for (const text of lines) {
    const p = document.createElement('div');
    p.className = 'menu-line';
    p.textContent = text;
    el.appendChild(p);
  }
  for (const row of rows) {
    const b = document.createElement('button');
    b.className = 'row';
    b.textContent = row.label;
    b.addEventListener('click', row.onTap);
    el.appendChild(b);
  }
  if (back) {
    const b = document.createElement('button');
    b.className = 'row back';
    b.textContent = back.label;
    b.addEventListener('click', back.onTap);
    el.appendChild(b);
  }
  el.hidden = false;
  el.scrollTop = 0;
}

export function closeMenu() {
  el.hidden = true;
  el.innerHTML = '';
}

export function isMenuOpen() {
  return !el.hidden;
}
