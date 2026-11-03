// The live website inside the chat page. It is the same origin, so the page can draw
// markers into it and notice clicks without any extra code on the public site.
import { pickLabel } from './chat-marks.js';

const STYLE = `
  .chat-overlay { position: fixed; z-index: 2147483000; pointer-events: none; box-sizing: border-box; border: 3px solid #1f7a43; border-radius: 8px; box-shadow: 0 0 0 4px rgba(31, 122, 67, 0.22); }
  .chat-overlay.delete { border-color: #c0202a; box-shadow: 0 0 0 4px rgba(192, 32, 42, 0.22); }
  .chat-overlay.add { border-style: dashed; }
  .chat-overlay.none { border-color: #6b6b6b; box-shadow: none; }
  .chat-overlay span { position: absolute; left: -3px; bottom: 100%; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 3px 9px; border-radius: 6px 6px 0 0; background: #1f7a43; color: #fff; font: 600 13px/1.35 system-ui, sans-serif; }
  .chat-overlay.delete span { background: #c0202a; }
  .chat-overlay.none span { background: #6b6b6b; }
  .chat-overlay.inside span { bottom: auto; top: 0; border-radius: 0 0 6px 0; }
  html.chat-picking, html.chat-picking * { cursor: pointer !important; }
`;

export function createSiteView(iframe, { onPick, onDragEnter }) {
  let marks = [];
  let hover = null;
  let picking = false;
  let scrollPending = false;

  const doc = () => iframe.contentDocument;
  const isReady = () => Boolean(doc()?.getElementById('chat-marks-style'));

  const isVisible = (el) => el.getClientRects().length > 0;

  function findTarget(mark) {
    if (mark.collection === 'texts') {
      // A button text can appear several times, also in menus that are closed right now.
      return [...doc().querySelectorAll('[data-i18n]')].find((el) => el.getAttribute('data-i18n') === mark.key && isVisible(el));
    }
    const items = [...doc().querySelectorAll(`[data-chat-item="${mark.collection}"]`)];
    return items.find((el) => mark.key && el.dataset.chatKey === mark.key)
      || doc().querySelector(`[data-chat-area="${mark.collection}"]`);
  }

  function place(overlay, el, win) {
    const box = el.getBoundingClientRect();
    let { left, right, top, bottom } = box;
    // Cards in a sideways track can be scrolled out of it.
    const track = el.closest('.tour-track');
    if (track) {
      const limit = track.getBoundingClientRect();
      left = Math.max(left, limit.left);
      right = Math.min(right, limit.right);
    }
    top = Math.max(top, 0);
    bottom = Math.min(bottom, win.innerHeight);
    const visible = right - left > 4 && bottom - top > 4;
    overlay.style.display = visible ? '' : 'none';
    if (!visible) return;
    overlay.style.left = `${left - 3}px`;
    overlay.style.top = `${top - 3}px`;
    overlay.style.width = `${right - left + 6}px`;
    overlay.style.height = `${bottom - top + 6}px`;
    overlay.classList.toggle('inside', top < 34);
  }

  function makeOverlay(tone, note) {
    const overlay = doc().createElement('div');
    overlay.className = `chat-overlay ${tone}`;
    const label = doc().createElement('span');
    label.textContent = note;
    overlay.appendChild(label);
    doc().body.appendChild(overlay);
    return overlay;
  }

  let drawn = [];

  function clearOverlays() {
    drawn.forEach(({ overlay }) => overlay.remove());
    drawn = [];
  }

  // Runs every frame while something is marked: lazy images, the reveal animations
  // and sideways scrolling all move things without a single event to listen to.
  function follow() {
    const win = iframe.contentWindow;
    if (!win || !isReady()) return;
    drawn.forEach(({ overlay, el }) => place(overlay, el, win));
    if (drawn.length) win.requestAnimationFrame(follow);
  }

  function draw() {
    if (!isReady()) return;
    clearOverlays();
    const list = hover ? [...marks, hover] : marks;
    drawn = list.map((mark) => {
      const el = mark.el || findTarget(mark);
      return el ? { overlay: makeOverlay(mark.tone, mark.note), el } : null;
    }).filter(Boolean);
    if (drawn.length) iframe.contentWindow.requestAnimationFrame(follow);
  }

  function scrollToFirst() {
    if (!isReady() || !marks.length || iframe.offsetParent === null) { scrollPending = marks.length > 0; return; }
    scrollPending = false;
    const el = findTarget(marks[0]);
    if (!el) return;
    const tall = el.getBoundingClientRect().height > iframe.clientHeight * 0.8;
    el.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'center' });
  }

  function pickFrom(target) {
    const item = target?.closest?.('[data-chat-item]');
    if (item) return { collection: item.dataset.chatItem, key: item.dataset.chatKey, el: item };
    const text = target?.closest?.('[data-i18n]');
    if (text) return { collection: 'texts', key: text.getAttribute('data-i18n'), el: text };
    const area = target?.closest?.('[data-chat-area]');
    return area ? { collection: area.dataset.chatArea, key: '', el: area } : null;
  }

  function onMove(e) {
    if (!picking) return;
    const found = pickFrom(e.target);
    const el = found?.el || e.target.closest?.('section, footer, header');
    if (hover?.el === el) return;
    hover = el ? { el, tone: found ? 'update' : 'none', note: found ? pickLabel(found.collection, found.key, found.el.textContent) : 'Geht nur im Code, nicht im Chat' } : null;
    draw();
  }

  function onClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    const found = pickFrom(e.target);
    // Phones have no hover, so a tap on the wrong spot has to explain itself too.
    if (!found) { onMove(e); return; }
    setPicking(false);
    onPick({ collection: found.collection, key: found.key, label: pickLabel(found.collection, found.key, found.el.textContent) });
  }

  function onKey(e) {
    if (picking && e.key === 'Escape') { setPicking(false); onPick(null); }
  }

  function setPicking(value) {
    picking = value;
    hover = null;
    doc()?.documentElement.classList.toggle('chat-picking', value);
    draw();
  }

  iframe.addEventListener('load', () => {
    const d = doc();
    const style = d.createElement('style');
    style.id = 'chat-marks-style';
    style.textContent = STYLE;
    d.head.appendChild(style);
    d.addEventListener('pointermove', onMove, true);
    d.addEventListener('click', onClick, true);
    d.addEventListener('keydown', onKey, true);
    d.addEventListener('dragenter', onDragEnter);
    d.documentElement.classList.toggle('chat-picking', picking);
    drawn = [];
    draw();
    if (scrollPending) scrollToFirst();
  });

  return {
    load() { if (!iframe.getAttribute('src')) iframe.src = '/'; },
    mark(list) {
      marks = list;
      scrollPending = false;
      draw();
      scrollToFirst();
    },
    // After the pane comes back into view: hidden frames can't scroll.
    refocus() { if (scrollPending) scrollToFirst(); else draw(); },
    reload(list) {
      marks = list;
      scrollPending = list.length > 0;
      clearOverlays();
      if (iframe.getAttribute('src')) iframe.contentWindow.location.reload();
    },
    setPicking,
    isPicking: () => picking,
  };
}
