// DOM + Telegram wiring. Routing by location.hash; rendering by render.js; actions by data-* attributes.
import { renderAdd, renderDeals, renderDetail, renderError, renderList, renderShowcase, renderUpdated } from './render.js';

// telegram-web-app.js defines window.Telegram.WebApp in any browser; only a real client reports a platform.
const webApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const tg = webApp && webApp.platform && webApp.platform !== 'unknown' ? webApp : null;
const view = document.getElementById('view');
const bar = document.getElementById('bar');
const updated = document.getElementById('updated');
let data = null;

if (tg) {
  document.body.classList.add('tg');
  try { tg.ready(); tg.expand(); } catch { /* vecchie versioni del client */ }
  try { if (tg.setHeaderColor) tg.setHeaderColor('#00439c'); if (tg.setBackgroundColor) tg.setBackgroundColor('#0b1b2b'); } catch { /* idem */ }
}

/** Sends a string to the bot. Inside Telegram the Mini App closes and the reply arrives in chat; outside, show it. */
function send(text) {
  if (tg && typeof tg.sendData === 'function') {
    tg.sendData(text);
    return;
  }
  window.prompt('Fuori da Telegram non posso parlare col bot. Copia e manda in chat:', text);
}

function openUrl(url) {
  if (tg && typeof tg.openLink === 'function') tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

function route() {
  const h = (location.hash || '#list').slice(1);
  const [name, arg] = h.split('/');
  if (name === 'detail') return { name, arg: h.slice('detail:'.length) };
  if (h.startsWith('detail:')) return { name: 'detail', arg: h.slice(7) };
  return { name: name || 'list', arg: arg || '' };
}

function setMain(text, onClick) {
  if (!tg || !tg.MainButton) return;
  const mb = tg.MainButton;
  try {
    if (mb.offClick && mainHandler) mb.offClick(mainHandler);
  } catch { /* nessun handler */ }
  mainHandler = null;
  if (!text) { try { mb.hide(); } catch { /* ignore */ } return; }
  mainHandler = onClick;
  try {
    mb.setText(text);
    mb.onClick(mainHandler);
    mb.show();
  } catch { /* ignore */ }
}
let mainHandler = null;

function addSubmit() {
  const name = (document.getElementById('add-name')?.value || '').trim();
  if (!name) { document.getElementById('add-name')?.focus(); return; }
  const status = document.querySelector('input[name="add-status"]:checked')?.value === 'owned' ? 'own' : 'add';
  const alias = (document.getElementById('add-alias')?.value || '').trim();
  const term = (document.getElementById('add-term')?.value || '').trim();
  const lines = [`/${status} ${name}`];
  if (alias) lines.push(`/alias ${name} | ${alias}`);
  if (term) lines.push(`/search ${name} | ${term}`);
  send(lines.join('\n'));
}

function render() {
  const r = route();
  for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.nav === (r.name === 'detail' || r.name === 'add' ? 'list' : r.name));
  if (!data) { view.innerHTML = renderError('Dati non disponibili: riapri tra poco.'); setMain(''); return; }
  switch (r.name) {
    case 'detail': {
      view.innerHTML = renderDetail(data, r.arg);
      const g = data.games.find((x) => String(x.id) === String(r.arg));
      setMain(g && g.best ? 'Apri sullo store' : '', () => { if (g && g.best) openUrl(g.best.url); });
      break;
    }
    case 'add':
      view.innerHTML = renderAdd();
      setMain('Aggiungi e cerca', addSubmit);
      setTimeout(() => document.getElementById('add-name')?.focus(), 50);
      break;
    case 'showcase':
      view.innerHTML = renderShowcase(data);
      setMain('');
      break;
    case 'deals':
      view.innerHTML = renderDeals(data, r.arg === 'mine' || r.arg === 'ps5' ? r.arg : 'all');
      setMain('');
      break;
    default:
      view.innerHTML = renderList(data, r.arg === 'owned' || r.arg === 'pending' ? r.arg : 'wanted');
      setMain('＋ Aggiungi gioco', () => { location.hash = '#add'; });
  }
  window.scrollTo(0, 0);
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-send], [data-url], [data-nav]');
  if (!el) return;
  if (el.dataset.send) { ev.preventDefault(); send(el.dataset.send); return; }
  if (el.dataset.url) { ev.preventDefault(); openUrl(el.dataset.url); return; }
  if (el.dataset.nav) { ev.preventDefault(); location.hash = '#' + el.dataset.nav; }
});

document.addEventListener('submit', (ev) => {
  if (ev.target && ev.target.id === 'add-form') { ev.preventDefault(); addSubmit(); }
});

window.addEventListener('hashchange', render);

async function load() {
  try {
    const res = await fetch(`./data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    updated.textContent = renderUpdated(data);
  } catch (e) {
    data = null;
    updated.textContent = '';
    console.error('data.json non caricato:', e);
  }
  render();
}

load();
