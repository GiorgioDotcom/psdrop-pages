// Pure renderers: data.json → HTML strings. No DOM, no Telegram, no network: tested with node --test.
// Every action control carries data-send (a string the bot understands), data-url (a store link)
// or data-nav (a route); app.js only reads those attributes.

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 1999 → "19,99 €", 123456 → "1.234,56 €", null → "—". Same format as the bot's messages. */
export function euro(cents) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const n = Math.round(cents);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const int = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = String(abs % 100).padStart(2, '0');
  return `${sign}${int},${dec} €`;
}

const dayMonth = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric' });
const dateTime = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** ISO → "30/10" (Europe/Rome); anything unparsable comes back as is. */
export function formatDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const parts = dayMonth.formatToParts(d);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return `${day}/${month}`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : dateTime.format(d);
}

/**
 * Step polyline for an SVG `points` attribute. Points are {at, priceCents}; x follows time, y the price
 * (higher price = higher on the chart). One point → a flat line; no points → "".
 */
export function chartPath(points, width, height) {
  const pts = [...points].filter((p) => Number.isFinite(p.priceCents)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (pts.length === 0) return '';
  const padX = 6;
  const padY = 8;
  const t0 = Date.parse(pts[0].at);
  const t1 = Date.parse(pts[pts.length - 1].at);
  const prices = pts.map((p) => p.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const x = (t) => (t1 === t0 ? padX : padX + ((t - t0) / (t1 - t0)) * (width - 2 * padX));
  const y = (price) => (max === min ? height / 2 : padY + ((max - price) / (max - min)) * (height - 2 * padY));
  const r = (n) => Math.round(n * 10) / 10;
  const out = [];
  if (pts.length === 1) return `${r(padX)},${r(y(pts[0].priceCents))} ${r(width - padX)},${r(y(pts[0].priceCents))}`;
  for (let i = 0; i < pts.length; i++) {
    const px = x(Date.parse(pts[i].at));
    if (i > 0) out.push(`${r(px)},${r(y(pts[i - 1].priceCents))}`);
    out.push(`${r(px)},${r(y(pts[i].priceCents))}`);
  }
  return out.join(' ');
}

const EDITION_WORDS = "(?:Gold|Deluxe|Ultimate|Complete|Definitive|Premium|Standard|Digital|Special|Legendary|Anniversary|Royal|Enhanced|Champions|Cross-Gen|Next-Gen|Day One|Launch|Collector'?s|Game of the Year|GOTY)";
const EDITION_LABEL = `(?:Edition|Edizione|Bundle)(?:\\s+(?:${EDITION_WORDS}|Edition|Edizione|Bundle))*`;

/**
 * "Hogwarts Legacy per PS5" → "Hogwarts Legacy": the game name the bot can match, out of a store edition title.
 * Same function as cleanStoreTitle in src/matching.ts; tests/matching.test.ts runs both copies over the same cases.
 */
export function cleanStoreTitle(name) {
  const raw = String(name ?? '').replace(/\s+/g, ' ').trim();
  let t = raw.replace(/[™®]/g, '');
  t = t.replace(/\s*\((?:PS4|PS5|PlayStation\s*[45])[^)]*\)\s*/gi, ' ');
  t = t.replace(/\s*(?:per|for)\s+PS[45](?:\s*(?:e|and|&|\/)\s*PS[45])?\s*$/i, '');
  t = t.replace(/\s*PS[45]\s*(?:e|and|&|\/)\s*PS[45]\s*$/i, '');
  // a trailing segment after " - ", " – " or ":" that is only an edition label ("- Cross-Gen Bundle", ": Definitive Edition")
  t = t.replace(new RegExp(`(?:\\s+[-–]\\s+|\\s*:\\s*)(?:The\\s+)?(?:${EDITION_WORDS}\\s+)*${EDITION_LABEL}\\s*$`, 'i'), '');
  // "Digital Deluxe Edition" glued to the name without a separator
  t = t.replace(new RegExp(`\\s+(?:${EDITION_WORDS}\\s+)+(?:Edition|Edizione)\\b.*$`, 'i'), '');
  const out = t.replace(/\s+/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(out) ? out : raw; // never an empty title: a bare separator falls back to the raw name
}

// ---------- small building blocks ----------

/** Store images accept a width: a 48 px cover does not need the 1 MB master. */
const thumb = (url, w) => (url && !url.includes('?') ? `${url}?w=${w}&thumb=false` : url);

const initial = (name) => { const m = /[\p{L}\p{N}]/u.exec(String(name ?? '')); return m ? m[0].toUpperCase() : ''; };
const cover = (url, cls = 'cover', name = '') => (url ? `<img class="${cls}" src="${esc(thumb(url, 240))}" alt="" loading="lazy">` : `<div class="${cls} cover-empty">${esc(initial(name))}</div>`);

const verdictChip = (advice) => {
  if (!advice) return '';
  const cls = advice.verdict === 'COMPRA' ? 'buy' : advice.verdict === 'ASPETTA' ? 'wait' : 'dep';
  return `<span class="chip ${cls}">${esc(advice.verdict)}</span>`;
};

const labelChips = (best) => {
  if (!best) return '';
  const chips = [];
  if (best.labels.includes('minimo')) chips.push('<span class="chip hot">🔥 minimo</span>');
  if (best.labels.includes('bundle')) chips.push('<span class="chip blue">📦 bundle conviene</span>');
  if (best.labels.includes('plus')) chips.push(`<span class="chip plus">✅ in PS Plus${best.plusCatalogTier && best.plusCatalogTier !== 'catalogo' ? ' ' + esc(best.plusCatalogTier) : ''}</span>`);
  return chips.join('');
};

const priceBlock = (priceCents, basePriceCents, extra = '') => {
  if (priceCents === null || priceCents === undefined) return `<div class="price"><span class="muted">—</span></div>`;
  const parts = [`<b>${euro(priceCents)}</b>`];
  if (basePriceCents && basePriceCents > priceCents) {
    parts.push(`<div class="strike">${euro(basePriceCents)}</div>`);
    parts.push(`<div class="off">-${Math.round((1 - priceCents / basePriceCents) * 100)}%</div>`);
  }
  if (extra) parts.push(extra);
  return `<div class="price">${parts.join('')}</div>`;
};

const empty = (text) => `<p class="empty">${esc(text)}</p>`;

const addOrInList = (item, data) => {
  if (item.gameId !== null && item.gameId !== undefined) {
    const g = data.games.find((x) => x.id === item.gameId);
    return `<span class="chip buy">nella tua lista${g ? ': ' + esc(g.name) : ''}</span>`;
  }
  return `<button class="btn small" data-send="/add ${esc(cleanStoreTitle(item.name))}">＋ Lo voglio</button>`;
};

export function renderUpdated(data) {
  const at = data.lastCheckAt || data.generatedAt;
  return at ? `Aggiornato ${esc(formatDateTime(at))}` : 'Mai aggiornato';
}

// ---------- screens ----------

export function renderList(data, tab = 'wanted') {
  const wanted = data.games.filter((g) => g.status === 'wanted');
  const owned = data.games.filter((g) => g.status === 'owned');
  const pendingCount = data.games.reduce((n, g) => n + g.pending.length, 0);
  const tabs = `<div class="tabs">
    <button class="tab${tab === 'wanted' ? ' on' : ''}" data-nav="list">Voluti ${wanted.length}</button>
    <button class="tab${tab === 'owned' ? ' on' : ''}" data-nav="list/owned">Posseduti ${owned.length}</button>
    <button class="tab${tab === 'pending' ? ' on' : ''}" data-nav="list/pending">Da confermare ${pendingCount}</button>
  </div>`;
  let body = '';
  if (tab === 'owned') {
    body = owned.length === 0
      ? empty('Nessun gioco posseduto. Segna quelli che hai: contano come zavorra nei bundle.')
      : owned.map((g) => `<div class="row" data-nav="detail:${g.id}">${cover(g.coverUrl ?? g.best?.coverUrl ?? null, 'cover', g.name)}<div class="t"><div class="name">${esc(g.name)}</div><div class="sub">posseduto</div></div><div class="chev">›</div></div>`).join('');
  } else if (tab === 'pending') {
    const rows = [];
    for (const g of data.games) {
      for (const p of g.pending) {
        rows.push(`<div class="row pending">${cover(p.coverUrl)}<div class="t"><div class="name">${esc(p.name)}</div><div class="sub">contiene «${esc(p.matchedOn)}»: è il tuo <b>${esc(g.name)}</b>?</div>
          <div class="btns"><button class="btn ok" data-send="match_yes:${g.id}:${esc(p.productId)}">Sì</button><button class="btn no" data-send="match_no:${g.id}:${esc(p.productId)}">No</button><button class="btn" data-url="${esc(p.url)}">Store</button></div></div></div>`);
      }
    }
    body = rows.length ? rows.join('') : empty('Niente da confermare.');
  } else {
    body = wanted.length === 0
      ? empty('Lista vuota. Aggiungi un gioco.')
      : wanted.map((g) => {
          const b = g.best;
          const sub = b ? esc(b.name) : 'nessun prezzo ancora';
          const chips = b ? labelChips(b) + verdictChip(b.advice) : '';
          const min = g.minEverCents !== null && b && g.minEverCents < b.priceCents ? `<div class="muted">min ${euro(g.minEverCents)}</div>` : '';
          return `<div class="row" data-nav="detail:${g.id}">${cover(g.coverUrl ?? b?.coverUrl ?? null, 'cover', g.name)}<div class="t"><div class="name">${esc(g.name)}</div><div class="sub">${sub}</div>${chips ? `<div class="chips">${chips}</div>` : ''}</div>${b ? priceBlock(b.priceCents, b.basePriceCents, min) : '<div class="price"><span class="muted">—</span></div>'}</div>`;
        }).join('');
  }
  return `<h1>La tua lista</h1>${tabs}<div class="list">${body}</div><button class="mainbtn" data-nav="add">＋ Aggiungi gioco</button>`;
}

function historyFacts(data, best, game) {
  const facts = [];
  if (game.minEverCents !== null) facts.push(`minimo visto da noi ${euro(game.minEverCents)}`);
  const prod = data.products[best.productId];
  if (prod && prod.history.length) facts.push(`${prod.history.length} rilevazion${prod.history.length === 1 ? 'e' : 'i'}`);
  return facts.join(' · ');
}

function chartSvg(points) {
  if (!points || points.length === 0) return '<p class="muted">Storico vuoto: cresce a ogni controllo prezzi.</p>';
  const w = 320;
  const h = 90;
  const path = chartPath(points, w, h);
  const last = path.split(' ').at(-1);
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const prices = sorted.map((p) => p.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="storico prezzo">
    <polyline fill="none" stroke="var(--blue)" stroke-width="2" points="${path}"/>
    <circle cx="${last.split(',')[0]}" cy="${last.split(',')[1]}" r="3.5" fill="var(--yellow)"/>
  </svg><div class="chart-legend"><span>${esc(formatDay(sorted[0].at))}</span><span>max ${euro(max)} · min ${euro(min)}</span><span>${esc(formatDay(sorted[sorted.length - 1].at))}</span></div>`;
}

export function renderDetail(data, gameId) {
  const g = data.games.find((x) => x.id === Number(gameId));
  if (!g) return `<h1>Dettaglio</h1>${empty('Gioco non trovato.')}<button class="btn" data-nav="list">‹ Lista</button>`;
  const b = g.best;
  const parts = [`<div class="head">${cover(g.coverUrl ?? b?.coverUrl ?? null, 'cover big', g.name)}<h1>${esc(g.name)}</h1></div>`];
  if (g.status === 'owned') parts.push('<p class="muted">Segnato come posseduto: niente avvisi, conta come zavorra nei bundle.</p>');
  if (b) {
    const prod = data.products[b.productId];
    const wantedLine = b.wantedNames.length > 1 || b.others.length > 0
      ? `<div class="line">Per te: ${b.wantedNames.map(esc).join(', ')} · <b>${euro(b.perWantedGameCents)} a gioco voluto</b></div>` : '';
    const others = b.others.length ? `<div class="line">Zavorra: ${b.others.map(esc).join(', ')}</div>` : '';
    const plus = b.plusPriceCents !== null && b.plusPriceCents !== b.priceCents ? `<div class="line">Con PS Plus: ${euro(b.plusPriceCents)}</div>` : '';
    const ends = b.offerEndsAt ? `<div class="line">Offerta fino al ${esc(formatDay(b.offerEndsAt))}</div>` : '';
    parts.push(`<div class="label">Opzione migliore oggi</div>
      <div class="row best" data-url="${esc(b.url)}">${cover(b.coverUrl)}<div class="t"><div class="name">${esc(b.name)}</div><div class="sub">${esc(b.platforms.join(', ') || '?')}</div><div class="chips">${labelChips(b)}</div></div>${priceBlock(b.priceCents, b.basePriceCents)}</div>
      ${wantedLine}${others}${plus}${ends}
      <div class="line advice">${verdictChip(b.advice)} <b>Consiglio: ${esc(b.advice.verdict)}</b> — ${esc(b.advice.reason)}${b.advice.shortHistory ? ' <i>(storico breve)</i>' : ''}</div>
      ${b.labels.includes('plus') ? '<div class="line plusnote">✅ Incluso in PS Plus: lo hai già con l\'abbonamento, comprarlo serve solo per tenerlo.</div>' : ''}
      <div class="section"><div class="label">Storico prezzo · 90 giorni</div>${chartSvg(prod ? prod.history : [])}<div class="muted">${esc(historyFacts(data, b, g))}</div></div>`);
    if (g.alternatives.length) {
      parts.push(`<div class="section"><div class="label">Alternative</div>${g.alternatives.map((a) => `<div class="row alt" data-url="${esc(a.url)}">${cover(a.coverUrl)}<div class="t"><div class="name">${esc(a.name)}</div><div class="sub">${a.others.length ? 'zavorra ' + a.others.map(esc).join(', ') : 'solo i tuoi giochi'}</div></div>${priceBlock(a.priceCents, a.basePriceCents, `<div class="muted">${euro(a.perWantedGameCents)} a gioco</div>`)}</div>`).join('')}</div>`);
    }
  } else if (g.status === 'wanted') {
    parts.push('<p class="muted">nessun prezzo ancora: il bot cerca le edizioni sullo store e ti chiede conferma in chat.</p>');
  }
  if (g.pending.length) {
    parts.push(`<div class="section"><div class="label">Da confermare</div>${g.pending.map((p) => `<div class="row pending">${cover(p.coverUrl)}<div class="t"><div class="name">${esc(p.name)}</div><div class="sub">contiene «${esc(p.matchedOn)}»: è il tuo ${esc(g.name)}?</div>
      <div class="btns"><button class="btn ok" data-send="match_yes:${g.id}:${esc(p.productId)}">Sì</button><button class="btn no" data-send="match_no:${g.id}:${esc(p.productId)}">No</button><button class="btn" data-url="${esc(p.url)}">Store</button></div></div></div>`).join('')}</div>`);
  }
  const actions = g.status === 'wanted'
    ? `<button class="btn" data-send="/own ${esc(g.name)}">Ce l'ho già</button><button class="btn no" data-send="/remove ${esc(g.name)}">Togli</button>`
    : `<button class="btn ok" data-send="/add ${esc(g.name)}">Lo voglio</button><button class="btn no" data-send="/remove ${esc(g.name)}">Togli</button>`;
  parts.push(`<div class="btns actions">${actions}</div>`);
  if (b) parts.push(`<button class="mainbtn" data-url="${esc(b.url)}">Apri sullo store</button>`);
  return parts.join('');
}

export function renderAdd() {
  return `<h1>Aggiungi un gioco</h1>
  <form id="add-form" autocomplete="off">
    <input id="add-name" class="field" type="text" placeholder="Nome del gioco (es. Silent Hill f)" required>
    <button class="btn inline" type="button" data-inline="add-name">🔍 Cerca con le copertine</button>
    <p class="muted">Apre la chat con <code>@psdrop_bot</code> e il nome già scritto: Telegram mostra i giochi dello store con la copertina, tocchi quello giusto e parte <code>/add</code>.</p>
    <div class="seg"><label><input type="radio" name="add-status" value="wanted" checked><span>Lo voglio</span></label><label><input type="radio" name="add-status" value="owned"><span>Ce l'ho già</span></label></div>
    <p class="muted">Un gioco posseduto non riceve avvisi ma conta come zavorra nei bundle.</p>
    <div class="label">Opzionale</div>
    <input id="add-alias" class="field" type="text" placeholder="Altro nome accettato (es. SH f)">
    <input id="add-term" class="field" type="text" placeholder="Termine di ricerca in più (es. la saga)">
    <p class="muted">Il bot cerca subito sullo store e ti manda in chat le edizioni da confermare.</p>
    <button class="mainbtn" type="submit">Aggiungi e cerca</button>
  </form>`;
}

const card = (item, data) => `<div class="card">${item.coverUrl ? `<img src="${esc(thumb(item.coverUrl, 360))}" alt="" loading="lazy" data-url="${esc(item.url)}">` : `<div class="cover-empty" data-url="${esc(item.url)}"></div>`}
  <div class="c"><b data-url="${esc(item.url)}">${esc(item.name)}</b><div class="sub">${item.plusTier ? '✅ PS Plus ' + esc(item.plusTier) : item.discountPct > 0 ? `<span class="off">-${item.discountPct}%</span> ${euro(item.priceCents)}` : euro(item.priceCents)}</div><div class="cardact">${addOrInList(item, data)}</div></div></div>`;

export function renderShowcase(data) {
  const top = data.storefront.top;
  const fresh = data.storefront.new;
  if (top.length === 0 && fresh.length === 0) return `<h1>Vetrina</h1>${empty('Vetrina non ancora caricata: arriva con il prossimo controllo del bot.')}`;
  const hero = top[0];
  const heroHtml = hero ? `<div class="hero" data-url="${esc(hero.url)}">${hero.coverUrl ? `<img src="${esc(thumb(hero.coverUrl, 720))}" alt="">` : ''}<div class="cap"><b>${esc(hero.name)}</b><div>N. 1 in Italia · ${euro(hero.priceCents)}</div></div></div><div class="heroact">${addOrInList(hero, data)}</div>` : '';
  return `<h1>Vetrina</h1>${heroHtml}
    ${top.length > 1 ? `<div class="label">I più giocati in Italia</div><div class="grid">${top.slice(1).map((i) => card(i, data)).join('')}</div>` : ''}
    ${fresh.length ? `<div class="label">Nuovi sullo store</div><div class="grid">${fresh.map((i) => card(i, data)).join('')}</div>` : ''}`;
}

export function renderDeals(data, filter = 'all') {
  let items = data.storefront.deals;
  if (filter === 'mine') items = items.filter((i) => i.gameId !== null && i.gameId !== undefined);
  if (filter === 'ps5') items = items.filter((i) => i.platforms.includes('PS5'));
  const tabs = `<div class="tabs">
    <button class="tab${filter === 'all' ? ' on' : ''}" data-nav="deals">Tutti</button>
    <button class="tab${filter === 'mine' ? ' on' : ''}" data-nav="deals/mine">Solo i miei</button>
    <button class="tab${filter === 'ps5' ? ' on' : ''}" data-nav="deals/ps5">PS5</button>
  </div>`;
  const kind = (c) => (c === 'GAME_BUNDLE' ? 'bundle' : c === 'PREMIUM_EDITION' ? 'edizione premium' : 'gioco completo');
  const body = items.length === 0
    ? empty(data.storefront.deals.length === 0 ? 'Nessuno sconto caricato: arriva con il prossimo controllo del bot.' : 'Nessuno sconto con questo filtro.')
    : items.map((i) => `<div class="row deal">${cover(i.coverUrl)}<div class="t"><div class="name" data-url="${esc(i.url)}">${esc(i.name)}</div><div class="sub">${esc(i.platforms.join(', ') || '?')} · ${kind(i.classification)}</div><div class="cardact">${addOrInList(i, data)}</div></div>${priceBlock(i.priceCents, i.basePriceCents)}</div>`).join('');
  return `<h1>Migliori sconti</h1>${tabs}<p class="muted">Tra i più venduti in promozione, ordinati per sconto.</p><div class="list">${body}</div>`;
}

export function renderError(message) {
  return `<div class="error">${esc(message)}</div>`;
}
