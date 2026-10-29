// WedPress – wedding seating chart and stationery. Offline: everything stays in this browser profile (IndexedDB).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Pro (Microsoft Store add-on via Digital Goods API) ----------
const FREE_GUESTS = 40;
const STORE_BILLING = 'https://store.microsoft.com/billing';
const PRO_SKU = 'wedpress_pro';
const PRO_IDS = [PRO_SKU];
let STORE_URL = 'https://apps.microsoft.com/search/publisher?name=NTQ37';
let proAvailable = false; // limits apply only when the Store actually sells the add-on
let proSku = PRO_SKU;
let isPro = false;
try { isPro = localStorage.getItem('wedpress-pro') === '1'; } catch (_) {}
const unlocked = () => isPro || !proAvailable;
async function billing() {
  if (!('getDigitalGoodsService' in window)) return null;
  try { return await window.getDigitalGoodsService(STORE_BILLING); } catch (_) { return null; }
}
function setPro(v) {
  isPro = v;
  try { localStorage.setItem('wedpress-pro', v ? '1' : '0'); } catch (_) {}
  const b = $('proBtn');
  b.textContent = v ? '★ Pro' : '★ Get Pro';
  b.classList.toggle('is-pro', v);
  b.hidden = !proAvailable && !v;
  renderAll();
}
async function checkPro() {
  const svc = await billing();
  if (!svc) return false;
  try {
    const details = await svc.getDetails(PRO_IDS).catch(() => []);
    proAvailable = details.length > 0;
    if (details[0]) { proSku = details[0].itemId; if (!PRO_IDS.includes(proSku)) PRO_IDS.push(proSku); }
    const list = await svc.listPurchases();
    const owned = list.some((p) => PRO_IDS.includes(p.itemId));
    setPro(owned);
    return owned;
  } catch (_) { return isPro; }
}
function proMessage(text) { const m = $('proMsg'); m.hidden = !text; m.textContent = text || ''; }
async function openPro(reason) {
  proMessage(reason || '');
  const svc = await billing();
  if (!svc) { $('buyBtn').textContent = 'Get WedPress on Microsoft Store'; $('restoreBtn').hidden = true; }
  else {
    $('restoreBtn').hidden = false;
    try {
      const [d] = await svc.getDetails([proSku]);
      const price = d && d.price ? new Intl.NumberFormat(undefined, { style: 'currency', currency: d.price.currency }).format(Number(d.price.value)) : '';
      $('buyBtn').textContent = price ? `Unlock Pro – ${price}` : 'Unlock Pro';
    } catch (_) { $('buyBtn').textContent = 'Unlock Pro'; }
  }
  if (!$('proDialog').open) $('proDialog').showModal();
}
async function buyPro() {
  const svc = await billing();
  if (!svc) { window.open(STORE_URL, '_blank'); return; }
  const methods = [{ supportedMethods: STORE_BILLING, data: { sku: proSku } }];
  try {
    let req;
    try { req = new PaymentRequest(methods); }
    catch (_) { req = new PaymentRequest(methods, { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } }); }
    const res = await req.show();
    await res.complete('success');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    proMessage('Purchase could not be completed: ' + (e.message || e));
    return;
  }
  if (await checkPro()) { proMessage('Thank you! Pro is unlocked. ★'); setTimeout(() => $('proDialog').close(), 1500); }
}
function needsPro(reason) { if (unlocked()) return false; openPro(reason); return true; }

// ---------- data ----------
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blank = () => ({ couple: '', date: '', venue: '', guests: [], tables: [], print: { kind: 'chart', style: 'ivory', chartBy: 'name', size: '18x24', paper: 'letter', sheetPaper: 'letter', heading: 'Please find your seat', meal: false, words: {}, photo: '' } });
let plan = blank();
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('wedpress', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbGet(k) { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function dbSet(k, v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
let saveTimer = 0;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => dbSet('plan', plan).catch(() => toast('Could not save – your disk may be full')), 300); }
function normalize(p) {
  const o = Object.assign(blank(), p || {});
  o.print = Object.assign(blank().print, (p && p.print) || {});
  o.guests = (o.guests || []).map((g) => Object.assign({ id: uid('g'), name: '', party: '', fam: '', rsvp: 'maybe', meal: '', kid: false, table: null }, g));
  o.tables = (o.tables || []).map((t, i) => Object.assign({ id: uid('t'), name: String(i + 1), seats: 8, shape: 'round', x: 30 + (i % 4) * 240, y: 30 + Math.floor(i / 4) * 300 }, t));
  return o;
}
const guestById = (id) => plan.guests.find((g) => g.id === id);
const tableById = (id) => plan.tables.find((t) => t.id === id);
const coming = (g) => g.rsvp !== 'no';
const atTable = (t) => plan.guests.filter((g) => g.table === t.id && coming(g));
const tableLabel = (t) => (/^\d+$/.test(t.name.trim()) ? `Table ${t.name.trim()}` : t.name.trim() || 'Table');
const sortName = (n) => { const p = String(n).trim().split(/\s+/); return (p.length > 1 ? p[p.length - 1] + ' ' + p.slice(0, -1).join(' ') : p[0] || '').toLowerCase(); };
const fill = (s) => String(s || '').replace(/\{couple\}/g, plan.couple || 'Emma & James').replace(/\{date\}/g, plan.date || 'Saturday, June 12, 2027').replace(/\{venue\}/g, plan.venue || 'Rosewood Gardens');

// ---------- UI helpers ----------
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); toast(`Saved ${name} to your Downloads folder`); }
function pickFile(accept, cb) { const i = $('fileIn'); i.value = ''; i.accept = accept; i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click(); }
let tab = 'guests';
function showTab(t) {
  tab = t;
  $('tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  ['guests', 'seating', 'print'].forEach((k) => { $('pane-' + k).hidden = k !== t; });
  renderAll();
}
function renderAll() { if (tab === 'guests') renderGuests(); else if (tab === 'seating') renderSeating(); else renderPrint(); }

// ---------- guests ----------
function canAddGuests(n) {
  if (plan.guests.length + n <= FREE_GUESTS || unlocked()) return true;
  openPro(`The free version holds ${FREE_GUESTS} guests. Unlock Pro for any number of guests.`);
  return false;
}
function addFromText(text, party) {
  const blocks = String(text).split(/\n\s*\n/).map((b) => b.split(/\n/).map((s) => s.trim()).filter(Boolean)).filter((b) => b.length);
  const n = blocks.reduce((a, b) => a + b.length, 0);
  if (!n) { toast('Type at least one name'); return 0; }
  if (!canAddGuests(n)) return 0;
  blocks.forEach((b) => { const fam = uid('f'); b.forEach((line) => { const [name, p, meal] = line.split(/\t|,/).map((s) => (s || '').trim()); plan.guests.push({ id: uid('g'), name, party: p || party || '', fam, rsvp: 'maybe', meal: meal || '', kid: false, table: null }); }); });
  save();
  return n;
}
function stats() {
  const all = plan.guests.length, yes = plan.guests.filter((g) => g.rsvp === 'yes').length, no = plan.guests.filter((g) => g.rsvp === 'no').length;
  const seated = plan.guests.filter((g) => g.table && coming(g)).length, seats = plan.tables.reduce((a, t) => a + Number(t.seats || 0), 0);
  const meals = {}; plan.guests.filter((g) => g.rsvp === 'yes' && g.meal).forEach((g) => { meals[g.meal] = (meals[g.meal] || 0) + 1; });
  return { all, yes, no, maybe: all - yes - no, seated, seats, meals, kids: plan.guests.filter((g) => g.kid && coming(g)).length };
}
function renderGuests() {
  if (document.activeElement !== $('couple')) $('couple').value = plan.couple;
  if (document.activeElement !== $('wdate')) $('wdate').value = plan.date;
  if (document.activeElement !== $('venue')) $('venue').value = plan.venue;
  const s = stats();
  $('stats').innerHTML = `<b>${s.all}</b> invited · <b>${s.yes}</b> attending · ${s.maybe} not answered · ${s.no} can't come<br><b>${s.seated}</b> seated at ${plan.tables.length} tables (${s.seats} seats)` + (Object.keys(s.meals).length ? '<br>Meals: ' + Object.entries(s.meals).map(([m, c]) => `${esc(m)} ${c}`).join(' · ') : '') + (unlocked() ? '' : `<br><span class="muted">Free version: up to ${FREE_GUESTS} guests</span>`);
  const q = $('gSearch').value.trim().toLowerCase(), f = $('gFilter').value;
  const list = plan.guests.filter((g) => (!q || (g.name + ' ' + g.party).toLowerCase().includes(q)) && (f === 'all' || (f === 'unseated' ? !g.table && coming(g) : g.rsvp === f)));
  const topt = '<option value="">—</option>' + plan.tables.map((t) => `<option value="${t.id}">${esc(tableLabel(t))}</option>`).join('');
  $('gBody').innerHTML = list.map((g) => `<tr data-id="${g.id}"><td class="name">${esc(g.name || '(no name)')}${g.kid ? ' <span class="muted">(child)</span>' : ''}</td><td>${esc(g.party)}</td>
    <td><select data-k="rsvp"><option value="maybe"${g.rsvp === 'maybe' ? ' selected' : ''}>❔ Not yet</option><option value="yes"${g.rsvp === 'yes' ? ' selected' : ''}>✔ Attending</option><option value="no"${g.rsvp === 'no' ? ' selected' : ''}>✖ Can't come</option></select></td>
    <td><input data-k="meal" list="meals" value="${esc(g.meal)}" maxlength="30" style="width:120px"></td>
    <td><select data-k="table">${topt.replace(`value="${g.table}"`, `value="${g.table}" selected`)}</select></td>
    <td><button class="x" data-k="del" title="Remove guest">✕</button></td></tr>`).join('');
  $('gEmpty').hidden = plan.guests.length > 0;
  const mealSet = [...new Set(['Chicken', 'Beef', 'Fish', 'Vegetarian', 'Vegan', 'Kids meal', ...plan.guests.map((g) => g.meal).filter(Boolean)])];
  $('meals').innerHTML = mealSet.map((m) => `<option value="${esc(m)}">`).join('');
}
let editGuest = null;
function openGuest(id) {
  const g = guestById(id); if (!g) return; editGuest = g;
  $('gdName').value = g.name; $('gdParty').value = g.party; $('gdRsvp').value = g.rsvp; $('gdMeal').value = g.meal; $('gdKid').checked = !!g.kid;
  $('guestDlg').showModal();
}

// ---------- seating ----------
let selGuest = null;
function freeSeats(t) { return Number(t.seats) - atTable(t).length; }
function seatGuest(gid, tid) {
  const g = guestById(gid); if (!g) return;
  if (tid) { const t = tableById(tid); if (t && freeSeats(t) <= 0 && g.table !== tid) toast(`${tableLabel(t)} is now over its ${t.seats} seats`); }
  g.table = tid || null;
  if (tid && g.rsvp === 'no') g.rsvp = 'maybe';
  selGuest = null; save(); renderAll();
}
function addTable(n) {
  for (let k = 0; k < n; k++) {
    const i = plan.tables.length, nums = plan.tables.map((t) => Number(t.name)).filter((x) => !isNaN(x));
    plan.tables.push({ id: uid('t'), name: String((nums.length ? Math.max(...nums) : 0) + 1), seats: Math.max(2, Math.min(30, Number($('tSeats').value) || 8)), shape: $('tShape').value, x: 30 + (i % 4) * 240, y: 30 + Math.floor(i / 4) * 300 });
  }
  save(); renderSeating();
}
function autoSeat() {
  const waiting = plan.guests.filter((g) => coming(g) && !g.table);
  if (!waiting.length) { toast('Everyone is already seated'); return; }
  const need = waiting.length - plan.tables.reduce((a, t) => a + Math.max(0, freeSeats(t)), 0);
  if (need > 0) {
    const per = Math.max(2, Number($('tSeats').value) || 8);
    addTable(Math.ceil(need / per));
    toast(`Added ${Math.ceil(need / per)} table(s) so everyone has a seat`);
  }
  const fams = {};
  waiting.forEach((g) => { const k = g.fam || g.id; (fams[k] = fams[k] || []).push(g); });
  Object.values(fams).sort((a, b) => b.length - a.length).forEach((fam) => {
    let left = fam.slice();
    while (left.length) {
      const party = left[0].party;
      const cands = plan.tables.filter((t) => freeSeats(t) > 0);
      if (!cands.length) break;
      const fits = cands.filter((t) => freeSeats(t) >= left.length);
      const score = (t) => (party && atTable(t).some((g) => g.party === party) ? 1000 : 0) - Math.abs(freeSeats(t) - left.length);
      const t = (fits.length ? fits : cands).sort((a, b) => score(b) - score(a) || freeSeats(b) - freeSeats(a))[0];
      const take = left.splice(0, Math.max(1, Math.min(left.length, freeSeats(t))));
      take.forEach((g) => { g.table = t.id; });
    }
  });
  save(); renderAll();
  toast('Everyone has a seat. Groups are kept together where possible – drag names to change anything.');
}
function renderSeating() {
  const q = $('uSearch').value.trim().toLowerCase();
  const waiting = plan.guests.filter((g) => coming(g) && !g.table && (!q || g.name.toLowerCase().includes(q)));
  $('unCount').textContent = `(${plan.guests.filter((g) => coming(g) && !g.table).length})`;
  let lastFam = null;
  $('unseated').innerHTML = waiting.map((g) => { const grp = g.fam && g.fam === lastFam; lastFam = g.fam; return `<div class="chip${grp ? ' grp' : ''}${selGuest === g.id ? ' sel' : ''}" draggable="true" data-g="${g.id}"><span>${esc(g.name)}</span><small>${esc(g.party)}</small></div>`; }).join('') || '<p class="hint">Everyone who is coming has a seat. 🎉</p>';
  $('room').innerHTML = plan.tables.map((t) => {
    const gs = atTable(t), free = Number(t.seats) - gs.length;
    return `<div class="tbl ${t.shape}${free === 0 ? ' full' : free < 0 ? ' over' : ''}" data-t="${t.id}" style="left:${t.x}px;top:${t.y}px">
      <div class="tbl-h" data-drag="${t.id}"><span>${esc(tableLabel(t))}</span><span><small>${gs.length}/${t.seats}</small><button data-edit="${t.id}" title="Edit table">✎</button></span></div>
      <div class="seats">${Array.from({ length: Math.max(Number(t.seats), gs.length) }, (_, i) => `<i class="${i < gs.length ? 'on' : ''}"></i>`).join('')}</div>
      <ul>${gs.map((g) => `<li draggable="true" data-g="${g.id}"><span>${esc(g.name)}${g.meal ? ` <span class="muted">· ${esc(g.meal)}</span>` : ''}</span><button data-off="${g.id}" title="Take off this table">✕</button></li>`).join('')}</ul></div>`;
  }).join('') || '<p class="empty">Add your first table on the left.</p>';
  const maxY = Math.max(900, ...plan.tables.map((t) => t.y + 320));
  $('room').style.minHeight = maxY + 'px';
}

// ---------- print styles ----------
const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive";
const SERIF = "Georgia, 'Times New Roman', serif";
const STYLES = {
  ivory: { name: 'Classic ivory', bg: '#fffdf7', ink: '#3f3a36', accent: '#a07d3b', soft: '#d9c7a1', deco: 'line' },
  greenery: { name: 'Greenery', bg: '#fbfcf8', ink: '#2f3b2b', accent: '#5f7d4f', soft: '#a8bf96', deco: 'leaves' },
  blush: { name: 'Blush flowers', bg: '#fff8f7', ink: '#5b2e3a', accent: '#c06c84', soft: '#f3c5cf', deco: 'flowers', pro: true },
  gold: { name: 'Black & gold', bg: '#141414', ink: '#f5ead2', accent: '#d4af37', soft: '#8a7330', deco: 'gold', pro: true },
  navy: { name: 'Navy & blush', bg: '#1d2b4f', ink: '#fdf4f2', accent: '#f2b8c2', soft: '#5d6f9a', deco: 'flowers', pro: true },
  terracotta: { name: 'Terracotta boho', bg: '#fbf3ec', ink: '#5a3424', accent: '#c4693d', soft: '#e7b897', deco: 'arches', pro: true },
};
const st = () => STYLES[plan.print.style] || STYLES.ivory;
const styleOk = () => !st().pro || !needsPro(`The ${st().name} style is part of Pro. Classic ivory and Greenery are free.`);
function sprig(x, y, len, rot, c) {
  let s = `<g transform="translate(${x},${y}) rotate(${rot})" opacity=".9"><path d="M0,0 Q${len * 0.12},${len * 0.5} 0,${len}" stroke="${c}" stroke-width="${len * 0.02}" fill="none"/>`;
  for (let k = 1; k <= 7; k++) { const yy = len * k / 8, sd = k % 2 ? 1 : -1; s += `<ellipse cx="${sd * len * 0.1}" cy="${yy}" rx="${len * 0.09}" ry="${len * 0.04}" transform="rotate(${sd * 35} ${sd * len * 0.1} ${yy})" fill="${c}"/>`; }
  return s + '</g>';
}
function flower(x, y, r, c, c2) { let s = `<g transform="translate(${x},${y})">`; for (let k = 0; k < 6; k++) { const a = k * 60 * Math.PI / 180; s += `<ellipse cx="${(Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(Math.sin(a) * r * 0.55).toFixed(1)}" rx="${(r * 0.42).toFixed(1)}" ry="${(r * 0.3).toFixed(1)}" transform="rotate(${k * 60} ${(Math.cos(a) * r * 0.55).toFixed(1)} ${(Math.sin(a) * r * 0.55).toFixed(1)})" fill="${c}" opacity=".85"/>`; } return s + `<circle r="${(r * 0.22).toFixed(1)}" fill="${c2}"/></g>`; }
function decorate(x, y, w, h, s) { // decorations along the edges of a card or poster (inside x, y, w, h)
  const S = st(), u = Math.min(w, h);
  let d = '';
  if (S.deco === 'leaves') d += sprig(x + u * 0.04, y + u * 0.04, u * 0.2, -50, S.accent) + sprig(x + w - u * 0.04, y + u * 0.04, u * 0.2, 50, S.accent) + sprig(x + u * 0.05, y + h - u * 0.05, u * 0.22, 220, S.soft) + sprig(x + w - u * 0.05, y + h - u * 0.05, u * 0.22, 140, S.soft);
  else if (S.deco === 'flowers') { d += flower(x + u * 0.09, y + u * 0.09, u * 0.07, S.accent, S.soft) + flower(x + u * 0.2, y + u * 0.05, u * 0.045, S.soft, S.accent) + sprig(x + u * 0.04, y + u * 0.16, u * 0.16, -10, S.soft) + flower(x + w - u * 0.09, y + h - u * 0.09, u * 0.07, S.accent, S.soft) + flower(x + w - u * 0.2, y + h - u * 0.05, u * 0.045, S.soft, S.accent) + sprig(x + w - u * 0.04, y + h - u * 0.16, u * 0.16, 170, S.soft); }
  else if (S.deco === 'gold') d += `<rect x="${x + u * 0.04}" y="${y + u * 0.04}" width="${w - u * 0.08}" height="${h - u * 0.08}" fill="none" stroke="${S.accent}" stroke-width="${u * 0.006}"/><rect x="${x + u * 0.055}" y="${y + u * 0.055}" width="${w - u * 0.11}" height="${h - u * 0.11}" fill="none" stroke="${S.accent}" stroke-width="${u * 0.002}"/>`;
  else if (S.deco === 'arches') d += `<path d="M${x + w * 0.5 - u * 0.36},${y + h} V${y + u * 0.42} A${u * 0.36},${u * 0.36} 0 0 1 ${x + w * 0.5 + u * 0.36},${y + u * 0.42} V${y + h}" fill="${S.soft}" opacity=".28"/><circle cx="${x + u * 0.12}" cy="${y + h - u * 0.12}" r="${u * 0.06}" fill="${S.accent}" opacity=".35"/><circle cx="${x + w - u * 0.1}" cy="${y + u * 0.1}" r="${u * 0.04}" fill="${S.accent}" opacity=".35"/>`;
  else d += `<rect x="${x + u * 0.045}" y="${y + u * 0.045}" width="${w - u * 0.09}" height="${h - u * 0.09}" fill="none" stroke="${S.accent}" stroke-width="${u * 0.003}"/>`;
  return d;
}
const fitFs = (txt, maxW, base, ratio) => Math.min(base, maxW / Math.max(1, String(txt).length * ratio));
function textBlock(lines, cx, cy, w, h, opts) { // centred lines; the first line can be big script
  const S = st(), o = Object.assign({ firstScript: true, base: h * 0.09 }, opts || {});
  const L = lines.map((t, i) => {
    const big = i === 0 && o.firstScript, fam = big ? SCRIPT : SERIF;
    const fs = big ? fitFs(t, w * 0.9, o.base * 1.9, 0.5) : fitFs(t, w * 0.9, o.base * (t.length > 34 ? 0.82 : 1), 0.5);
    return { t, fs, fam, col: big ? S.accent : S.ink, gap: big ? 1.15 : 1.5 };
  });
  const total = L.reduce((a, l) => a + l.fs * l.gap, 0);
  let y = cy - total / 2;
  return L.map((l) => { y += l.fs * l.gap; return `<text x="${cx}" y="${(y - l.fs * (l.gap - 1) - l.fs * 0.2).toFixed(1)}" text-anchor="middle" font-family="${l.fam}" font-size="${l.fs.toFixed(1)}" fill="${l.col}">${esc(l.t)}</text>`; }).join('');
}
const cutBox = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#b9b9b9" stroke-width=".6" stroke-dasharray="4 3"/>`;
const PAPER = { letter: [612, 792], a4: [595.3, 841.9] };
const svgPage = (W, H, body) => ({ w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>` });

// ---------- printouts ----------
const KINDS = {
  chart: 'Seating chart', place: 'Place cards', escort: 'Escort cards', tablenum: 'Table numbers',
  savedate: 'Save the date', invite: 'Invitation', rsvp: 'RSVP cards', caterer: 'Table list for caterer',
};
const DEFAULT_WORDS = {
  savedate: 'Save the Date\n{couple}\n{date}\n{venue}\nInvitation to follow',
  invite: '{couple}\nTogether with their families\nrequest the pleasure of your company\nat the celebration of their marriage\n{date}\n{venue}\nDinner and dancing to follow',
  rsvp: 'Kindly Reply\nby May 1\nName(s) ______________________\n☐ Joyfully accepts     ☐ Regretfully declines\nMeal: ☐ Chicken  ☐ Fish  ☐ Vegetarian',
};
const POSTER_SIZES = { '18x24': ['18 × 24 in', 18, 24], '24x36': ['24 × 36 in', 24, 36], '16x20': ['16 × 20 in', 16, 20], '11x17': ['11 × 17 in', 11, 17], a2: ['A2 – 420 × 594 mm', 16.54, 23.39], a3: ['A3 – 297 × 420 mm', 11.69, 16.54], letter: ['Letter – one sheet', 8.5, 11], a4: ['A4 – one sheet', 8.27, 11.69] };
const seatedGuests = () => plan.guests.filter((g) => coming(g) && g.table && tableById(g.table));
const sampleNames = ['Emma Carter', 'James Brooks', 'Olivia Reed', 'Noah Bennett'];
function chartPage() {
  const P = plan.print, [, wi, hi] = POSTER_SIZES[P.size] || POSTER_SIZES['18x24'], W = wi * 72, H = hi * 72, S = st(), u = Math.min(W, H);
  let b = `<rect width="${W}" height="${H}" fill="${S.bg}"/>` + decorate(0, 0, W, H);
  const m = u * 0.08;
  const hfs = fitFs(P.heading || '', W - 4 * m, u * 0.085, 0.48);
  b += `<text x="${W / 2}" y="${m + hfs}" text-anchor="middle" font-family="${SCRIPT}" font-size="${hfs}" fill="${S.accent}">${esc(P.heading || '')}</text>`;
  const sub = [plan.couple, plan.date].filter(Boolean).join(' · ');
  const sfs = u * 0.026;
  if (sub) b += `<text x="${W / 2}" y="${m + hfs + sfs * 2}" text-anchor="middle" font-family="${SERIF}" font-size="${sfs}" letter-spacing="${sfs * 0.15}" fill="${S.ink}">${esc(sub.toUpperCase())}</text>`;
  const ax = m * 1.1, ay = m + hfs + sfs * 3.6, aw = W - 2.2 * m, ah = H - ay - m * 1.1;
  const gs = seatedGuests();
  if (!gs.length) { b += `<text x="${W / 2}" y="${ay + ah / 2}" text-anchor="middle" font-family="${SERIF}" font-size="${u * 0.03}" fill="${S.ink}" opacity=".6">Seat your guests on the Seating page – their names appear here.</text>`; return svgPage(W, H, b); }
  if (P.chartBy === 'table') {
    const tabs = plan.tables.filter((t) => atTable(t).length);
    let best = null;
    for (let cols = 1; cols <= 8; cols++) {
      const rows = Math.ceil(tabs.length / cols), cw = aw / cols, ch = ah / rows;
      const maxN = Math.max(...tabs.map((t) => atTable(t).length)) + 2.2, maxL = Math.max(...gs.map((g) => g.name.length), 8);
      const fs = Math.min(ch / (maxN * 1.45), (cw * 0.86) / (maxL * 0.5));
      if (!best || fs > best.fs) best = { cols, rows, cw, ch, fs };
    }
    const { cols, cw, ch, fs } = best;
    tabs.forEach((t, i) => {
      const cx = ax + (i % cols) * cw + cw / 2, ty = ay + Math.floor(i / cols) * ch + fs * 1.6;
      b += `<text x="${cx}" y="${ty}" text-anchor="middle" font-family="${SCRIPT}" font-size="${fs * 1.35}" fill="${S.accent}">${esc(tableLabel(t))}</text>`;
      b += `<line x1="${cx - cw * 0.18}" y1="${ty + fs * 0.45}" x2="${cx + cw * 0.18}" y2="${ty + fs * 0.45}" stroke="${S.soft}" stroke-width="${fs * 0.06}"/>`;
      atTable(t).slice().sort((a, c) => sortName(a.name).localeCompare(sortName(c.name))).forEach((g, k) => { b += `<text x="${cx}" y="${ty + fs * 1.6 + k * fs * 1.4}" text-anchor="middle" font-family="${SERIF}" font-size="${fs}" fill="${S.ink}">${esc(g.name)}</text>`; });
    });
  } else {
    const list = gs.slice().sort((a, c) => sortName(a.name).localeCompare(sortName(c.name)));
    let best = null;
    const maxL = Math.max(...list.map((g) => g.name.length + tableLabel(tableById(g.table)).length), 12);
    for (let cols = 1; cols <= 10; cols++) {
      const rows = Math.ceil(list.length / cols), cw = aw / cols;
      const fs = Math.min(ah / (rows * 1.55), (cw * 0.88) / (maxL * 0.5 + 3));
      if (!best || fs > best.fs) best = { cols, rows, cw, fs };
    }
    const { rows, cw, fs } = best;
    list.forEach((g, i) => {
      const c = Math.floor(i / rows), r = i % rows, x0 = ax + c * cw + cw * 0.06, x1 = ax + (c + 1) * cw - cw * 0.06, y = ay + (r + 1) * fs * 1.55;
      b += `<text x="${x0}" y="${y}" font-family="${SERIF}" font-size="${fs}" fill="${S.ink}">${esc(g.name)}</text><text x="${x1}" y="${y}" text-anchor="end" font-family="${SERIF}" font-size="${fs}" font-style="italic" fill="${S.accent}">${esc(tableLabel(tableById(g.table)))}</text>`;
    });
  }
  return svgPage(W, H, b);
}
function sheetPages(itemW, itemH, cols, rows, items, draw, landscape) {
  const [pw, ph] = PAPER[plan.print.sheetPaper] || PAPER.letter, W = landscape ? ph : pw, H = landscape ? pw : ph;
  const per = cols * rows, pages = [];
  const x0 = (W - cols * itemW) / 2, y0 = (H - rows * itemH) / 2;
  for (let p = 0; p < Math.max(1, Math.ceil(items.length / per)); p++) {
    let b = `<rect width="${W}" height="${H}" fill="#fff"/>`;
    for (let k = 0; k < per; k++) {
      const it = items[p * per + k]; if (it === undefined) continue;
      const x = x0 + (k % cols) * itemW, y = y0 + Math.floor(k / cols) * itemH;
      b += draw(it, x, y, itemW, itemH, `${p}_${k}`) + cutBox(x, y, itemW, itemH);
    }
    pages.push(svgPage(W, H, b));
  }
  return pages;
}
function namesForCards() { const gs = seatedGuests().slice().sort((a, c) => sortName(a.name).localeCompare(sortName(c.name))); return gs.length ? gs : sampleNames.map((n, i) => ({ name: n, table: null, meal: '', sample: i + 1 })); }
const cardTable = (g) => (g.table ? tableLabel(tableById(g.table)) : `Table ${g.sample || 1}`);
function photoSvg(x, y, w, h, key) {
  const ph = plan.print.photo;
  if (!ph) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${st().soft}" opacity=".35"/><text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-family="${SERIF}" font-size="${h * 0.06}" fill="${st().ink}" opacity=".7">Your photo here</text>`;
  return `<clipPath id="ph${key}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><image href="${ph}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph${key})"/>`;
}
function pages() {
  const P = plan.print, S = () => st();
  const words = (k) => fill(P.words[k] != null ? P.words[k] : DEFAULT_WORDS[k]).split('\n').map((s) => s.trim()).filter(Boolean);
  switch (P.kind) {
    case 'chart': return [chartPage()];
    case 'place': // tent cards 3.5 × 4 in, folded to 3.5 × 2 in
      return sheetPages(252, 288, 2, 2, namesForCards(), (g, x, y, w, h, key) => {
        const half = h / 2, s = S();
        let b = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>`;
        b += `<line x1="${x}" y1="${y + half}" x2="${x + w}" y2="${y + half}" stroke="#c8c8c8" stroke-width=".5" stroke-dasharray="2 3"/>`;
        b += `<g>${decorate(x, y + half, w, half)}</g>`;
        b += `<text x="${x + w / 2}" y="${y + half + half * 0.5}" text-anchor="middle" font-family="${SCRIPT}" font-size="${fitFs(g.name, w * 0.82, half * 0.26, 0.5)}" fill="${s.accent}">${esc(g.name)}</text>`;
        const sub = [cardTable(g), P.meal && g.meal ? g.meal : ''].filter(Boolean).join(' · ');
        b += `<text x="${x + w / 2}" y="${y + half + half * 0.76}" text-anchor="middle" font-family="${SERIF}" font-size="${half * 0.1}" letter-spacing="1.5" fill="${s.ink}">${esc(sub.toUpperCase())}</text>`;
        b += `<text x="${x + w / 2}" y="${y + half - 6}" text-anchor="middle" font-family="${SERIF}" font-size="6" fill="#aaa">fold here – this half is the back</text>`;
        return b;
      });
    case 'escort': // flat cards 3.5 × 2 in, 10 per page
      return sheetPages(252, 144, 2, 5, namesForCards(), (g, x, y, w, h) => {
        const s = S();
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>` + decorate(x, y, w, h) + `<text x="${x + w / 2}" y="${y + h * 0.48}" text-anchor="middle" font-family="${SCRIPT}" font-size="${fitFs(g.name, w * 0.8, h * 0.22, 0.5)}" fill="${s.accent}">${esc(g.name)}</text><text x="${x + w / 2}" y="${y + h * 0.74}" text-anchor="middle" font-family="${SERIF}" font-size="${h * 0.1}" letter-spacing="1.5" fill="${s.ink}">${esc(cardTable(g).toUpperCase())}</text>`;
      });
    case 'tablenum': { // 5 × 7 in, two on a landscape sheet
      const ts = plan.tables.length ? plan.tables : [{ name: '1' }, { name: '2' }];
      return sheetPages(360, 504, 2, 1, ts, (t, x, y, w, h) => {
        const s = S(), num = /^\d+$/.test(String(t.name).trim());
        let b = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>` + decorate(x, y, w, h);
        if (num) b += `<text x="${x + w / 2}" y="${y + h * 0.36}" text-anchor="middle" font-family="${SCRIPT}" font-size="${h * 0.08}" fill="${s.ink}">Table</text><text x="${x + w / 2}" y="${y + h * 0.66}" text-anchor="middle" font-family="${SERIF}" font-size="${h * 0.3}" fill="${s.accent}">${esc(String(t.name).trim())}</text>`;
        else b += `<text x="${x + w / 2}" y="${y + h * 0.52}" text-anchor="middle" font-family="${SCRIPT}" font-size="${fitFs(t.name, w * 0.8, h * 0.11, 0.5)}" fill="${s.accent}">${esc(t.name)}</text>`;
        if (plan.couple) b += `<text x="${x + w / 2}" y="${y + h * 0.86}" text-anchor="middle" font-family="${SERIF}" font-size="${h * 0.028}" letter-spacing="2" fill="${s.ink}">${esc(plan.couple.toUpperCase())}</text>`;
        return b;
      }, true);
    }
    case 'savedate': // 7 × 5 in, two per portrait sheet, photo on the left
      return sheetPages(504, 360, 1, 2, [1, 2], (_, x, y, w, h, key) => {
        const s = S(), pw = w * 0.48;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>` + photoSvg(x, y, pw, h, key) + `<g>${decorate(x + pw, y, w - pw, h)}</g>` + textBlock(words('savedate'), x + pw + (w - pw) / 2, y + h / 2, w - pw, h, { base: h * 0.052 });
      });
    case 'invite': // 5 × 7 in portrait, two on a landscape sheet
      return sheetPages(360, 504, 2, 1, [1, 2], (_, x, y, w, h) => { const s = S(); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>` + decorate(x, y, w, h) + textBlock(words('invite'), x + w / 2, y + h / 2, w * 0.86, h, { base: h * 0.036 }); }, true);
    case 'rsvp': // 5.5 × 4.25 in, four per sheet
      return sheetPages(396, 306, 2, 2, [1, 2, 3, 4], (_, x, y, w, h) => { const s = S(); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${s.bg}"/>` + decorate(x, y, w, h) + textBlock(words('rsvp'), x + w / 2, y + h / 2, w * 0.84, h, { base: h * 0.06 }); }, true);
    case 'caterer': {
      const [W, H] = PAPER[P.sheetPaper] || PAPER.letter, out = [];
      const lines = [];
      const sg = seatedGuests(), am = {}; sg.forEach((g) => { if (g.meal) am[g.meal] = (am[g.meal] || 0) + 1; });
      const kids = sg.filter((g) => g.kid).length, used = plan.tables.filter((t) => atTable(t).length).length;
      lines.push(['h', plan.couple ? `${plan.couple} – table list` : 'Table list']);
      lines.push(['s', `${sg.length} guests at ${used} tables` + (Object.keys(am).length ? ' · Meals: ' + Object.entries(am).map(([m, c]) => `${m} ${c}`).join(', ') : '') + (kids ? ` · Children: ${kids}` : '')]);
      plan.tables.forEach((t) => {
        const gs = atTable(t); if (!gs.length) return;
        const mc = {}; gs.forEach((g) => { if (g.meal) mc[g.meal] = (mc[g.meal] || 0) + 1; });
        lines.push(['t', `${tableLabel(t)} – ${gs.length} guests` + (Object.keys(mc).length ? '  (' + Object.entries(mc).map(([m, c]) => `${m} ${c}`).join(', ') + ')' : '')]);
        gs.forEach((g) => lines.push(['g', g.name, [g.meal, g.kid ? 'child' : ''].filter(Boolean).join(', ')]));
      });
      let b = '', y = 64;
      const flush = () => { out.push(svgPage(W, H, `<rect width="${W}" height="${H}" fill="#fff"/>` + b)); b = ''; y = 64; };
      lines.forEach((l) => {
        const hgt = l[0] === 'h' ? 30 : l[0] === 't' ? 26 : 16;
        if (y + hgt > H - 50) flush();
        if (l[0] === 'h') b += `<text x="54" y="${y}" font-family="${SERIF}" font-size="20" font-weight="700" fill="#222">${esc(l[1])}</text>`;
        else if (l[0] === 's') b += `<text x="54" y="${y}" font-family="${SERIF}" font-size="11" fill="#555">${esc(l[1])}</text>`;
        else if (l[0] === 't') b += `<text x="54" y="${y + 8}" font-family="${SERIF}" font-size="13" font-weight="700" fill="#7c3a4e">${esc(l[1])}</text>`;
        else b += `<text x="72" y="${y}" font-family="${SERIF}" font-size="11" fill="#222">${esc(l[1])}</text><text x="${W - 54}" y="${y}" text-anchor="end" font-family="${SERIF}" font-size="11" fill="#666">${esc(l[2])}</text>`;
        y += hgt;
      });
      flush();
      return out;
    }
  }
  return [];
}
let page = 0;
function renderPrint() {
  const P = plan.print;
  $('kinds').innerHTML = Object.entries(KINDS).map(([k, n]) => `<button data-k="${k}" class="${P.kind === k ? 'on' : ''}">${n}</button>`).join('');
  $('pStyle').innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${esc(s.name)}${s.pro && !unlocked() ? ' (Pro)' : ''}</option>`).join('');
  $('pStyle').value = P.style;
  $('pSize').innerHTML = Object.entries(POSTER_SIZES).map(([k, v]) => `<option value="${k}">${esc(v[0])}${!['letter', 'a4'].includes(k) && !unlocked() ? ' (Pro)' : ''}</option>`).join('');
  $('pSize').value = P.size; $('pChartBy').value = P.chartBy; $('pPaper').value = P.paper; $('pSheetPaper').value = P.sheetPaper; $('pMeal').checked = !!P.meal;
  if (document.activeElement !== $('pHeading')) $('pHeading').value = P.heading;
  const isCard = ['savedate', 'invite', 'rsvp'].includes(P.kind);
  $('optPoster').hidden = P.kind !== 'chart';
  $('optSheet').hidden = P.kind === 'chart';
  $('optCard').hidden = !isCard;
  $('photoBtn').parentElement.parentElement.hidden = P.kind !== 'savedate';
  $('mealRow').hidden = P.kind !== 'place';
  $('pStyle').parentElement.hidden = P.kind === 'caterer';
  $('pPaperRow').hidden = ['letter', 'a4'].includes(P.size);
  if (isCard && document.activeElement !== $('pWords')) $('pWords').value = P.words[P.kind] != null ? P.words[P.kind] : DEFAULT_WORDS[P.kind];
  const ps = pages();
  page = Math.min(page, ps.length - 1);
  $('preview').innerHTML = ps[page].svg.replace(/ width="[\d.]+" height="[\d.]+"/, ' preserveAspectRatio="xMidYMid meet"');
  $('pgInfo').textContent = `Page ${page + 1} of ${ps.length}`;
  $('pgPrev').disabled = page === 0; $('pgNext').disabled = page >= ps.length - 1;
  const usesSample = ['place', 'escort'].includes(P.kind) && !seatedGuests().length;
  let info = '';
  if (P.kind === 'chart') info = ['letter', 'a4'].includes(P.size) ? 'Prints on one sheet.' : `Prints on ${tiles(ps[0]).length} home printer sheets to tape together – or save the poster file for a print shop.`;
  else if (P.kind === 'place') info = 'Tent cards: cut along the dashed lines and fold in the middle. Card stock works best.';
  else if (P.kind === 'escort') info = 'Ten 3.5 × 2 in cards on each sheet.';
  else if (P.kind === 'tablenum') info = 'Two 5 × 7 in table numbers on each sheet – they fit standard frames.';
  else if (P.kind === 'savedate') info = 'Two 7 × 5 in cards on each sheet. {couple}, {date} and {venue} are filled in from the Guests page.';
  else if (P.kind === 'invite') info = 'Two 5 × 7 in invitations on each sheet. Edit the words on the left.';
  else if (P.kind === 'rsvp') info = 'Four 5.5 × 4.25 in reply cards on each sheet.';
  else info = 'A plain list for your venue and caterer: every table with names, meals and children.';
  if (usesSample) info += ' Showing sample names – seat your guests to print their cards.';
  $('pInfo').textContent = info;
}
function tiles(p) {
  const P = plan.print, [pw, ph] = P.paper === 'a4' ? [8.27, 11.69] : [8.5, 11], wi = p.w / 72, hi = p.h / 72;
  const mg = 0.35, ov = 0.25, tw = pw - 2 * mg, th = ph - 2 * mg;
  const cols = Math.max(1, Math.ceil((wi - ov) / (tw - ov))), rows = Math.max(1, Math.ceil((hi - ov) / (th - ov)));
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ r, c, x: c * (tw - ov), y: r * (th - ov), tw, th, pw, ph, mg, rows, cols });
  return out;
}
const isBigChart = () => plan.print.kind === 'chart' && !['letter', 'a4'].includes(plan.print.size);
function printNow() {
  const P = plan.print;
  if (P.kind !== 'caterer' && !styleOk()) return;
  if (isBigChart() && needsPro('Big seating chart posters are part of Pro. The Letter and A4 chart is free.')) return;
  const ps = pages();
  let out, size;
  if (isBigChart()) {
    const p = ps[0], inner = p.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''), T = tiles(p);
    size = `${P.paper === 'a4' ? 'A4' : 'letter'} portrait`;
    out = T.map((t) => {
      const X = t.x * 72, Y = t.y * 72, w = t.tw * 72, h = t.th * 72, mk = 14;
      const marks = `<g stroke="#999" stroke-width=".6"><path d="M${X},${Y - mk} V${Y} H${X - mk}"/><path d="M${X + w},${Y - mk} V${Y} H${X + w + mk}"/><path d="M${X},${Y + h + mk} V${Y + h} H${X - mk}"/><path d="M${X + w},${Y + h + mk} V${Y + h} H${X + w + mk}"/></g>`;
      const label = `<text x="${X + 4}" y="${Y + h + 16}" font-size="8" fill="#888" font-family="Segoe UI, sans-serif">Row ${t.r + 1} of ${t.rows} · Column ${t.c + 1} of ${t.cols} – overlap ¼ in with the next sheet</text>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X - t.mg * 72} ${Y - t.mg * 72} ${t.pw * 72} ${t.ph * 72}" style="width:${t.pw}in;height:${t.ph}in;display:block;page-break-after:always">${inner}${marks}${label}</svg>`;
    });
  } else {
    const p0 = ps[0], land = p0.w > p0.h, paper = P.kind === 'chart' ? (P.size === 'a4' ? 'A4' : 'letter') : (P.sheetPaper === 'a4' ? 'A4' : 'letter');
    size = `${paper} ${land ? 'landscape' : 'portrait'}`;
    out = ps.map((p) => p.svg.replace(/ width="([\d.]+)" height="([\d.]+)"/, (_, w, h) => ` style="width:${(w / 72).toFixed(3)}in;height:${(h / 72).toFixed(3)}in;display:block;page-break-after:always"`));
  }
  // every printed page gets its own ids (the preview has the same ids and is hidden while printing)
  out = out.map((pg, i) => pg.replace(/id="([^"]+)"/g, `id="$1_p${i}"`).replace(/url\(#([^)]+)\)/g, `url(#$1_p${i})`));
  $('pageRule').textContent = `@page { size: ${size}; margin: 0; }`;
  $('printArea').innerHTML = out.join('');
  window.print();
  setTimeout(() => { $('pageRule').textContent = ''; }, 1000);
}
async function savePicture() {
  const P = plan.print;
  if (needsPro('Saving high-resolution pictures for a print shop is part of Pro. Printing at home is free.')) return;
  if (P.kind !== 'caterer' && !styleOk()) return;
  const p = pages()[page];
  const wi = p.w / 72, hi = p.h / 72, dpi = Math.min(300, Math.floor(Math.sqrt(40e6 / (wi * hi))));
  toast('Making your picture…');
  const img = new Image(), url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = Math.round(wi * dpi); c.height = Math.round(hi * dpi);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const base = (plan.couple || 'wedding').replace(/[\\/:*?"<>|&]+/g, ' ').replace(/\s+/g, '-').toLowerCase();
  c.toBlob((bl) => download(bl, `${base}-${P.kind}${P.kind === 'chart' ? '-' + P.size : '-page' + (page + 1)}.jpg`), 'image/jpeg', 0.93);
}
function shrinkPhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.88)); };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That file is not a picture'); rej(new Error('bad image')); };
    img.src = url;
  });
}

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
function importCsv(text) {
  const rows = parseCsv(text); if (!rows.length) { toast('No names were found in that file'); return; }
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const has = head.some((h) => /name|guest|first|last/.test(h));
  const col = (re) => head.findIndex((h) => re.test(h));
  const ci = has ? { name: col(/^(full )?name|guest/), first: col(/first/), last: col(/last|surname/), party: col(/group|party|side|household|family/), meal: col(/meal|menu|entree|food/), rsvp: col(/rsvp|attend|status|reply/), table: col(/table/) } : { name: 0, party: 1, meal: 2, first: -1, last: -1, rsvp: -1, table: -1 };
  const data = has ? rows.slice(1) : rows;
  if (!canAddGuests(data.length)) return;
  const famOf = {};
  data.forEach((r) => {
    const g = (i) => (i >= 0 ? String(r[i] || '').trim() : '');
    const name = g(ci.name) || [g(ci.first), g(ci.last)].filter(Boolean).join(' ');
    if (!name) return;
    const party = g(ci.party), rs = g(ci.rsvp).toLowerCase();
    const fam = party ? (famOf[party] = famOf[party] || uid('f')) : uid('f');
    let table = null; const tn = g(ci.table);
    if (tn) { let t = plan.tables.find((x) => x.name.trim().toLowerCase() === tn.toLowerCase() || tableLabel(x).toLowerCase() === tn.toLowerCase()); if (!t) { const i = plan.tables.length; t = { id: uid('t'), name: tn.replace(/^table\s*/i, ''), seats: 8, shape: 'round', x: 30 + (i % 4) * 240, y: 30 + Math.floor(i / 4) * 300 }; plan.tables.push(t); } table = t.id; }
    plan.guests.push({ id: uid('g'), name, party, fam, rsvp: /^(y|yes|attend|accept|coming|1|true)/.test(rs) ? 'yes' : /^(n|no|decline|regret|0|false)/.test(rs) ? 'no' : 'maybe', meal: g(ci.meal), kid: false, table });
  });
  save(); renderAll(); toast(`Added ${data.length} guests`);
}
function exportCsv() {
  const q = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
  const lines = [['Name', 'Group', 'RSVP', 'Meal', 'Child', 'Table'].join(',')].concat(plan.guests.map((g) => [q(g.name), q(g.party), q(g.rsvp === 'yes' ? 'Attending' : g.rsvp === 'no' ? "Can't come" : 'Not answered'), q(g.meal), g.kid ? 'Yes' : '', q(g.table && tableById(g.table) ? tableLabel(tableById(g.table)) : '')].join(',')));
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }), `${(plan.couple || 'wedding').replace(/[\\/:*?"<>|&]+/g, ' ').trim() || 'wedding'} guests.csv`);
}

// ---------- sample ----------
function sample() {
  plan = blank();
  plan.couple = 'Emma & James'; plan.date = 'Saturday, June 12, 2027'; plan.venue = 'Rosewood Gardens, Austin, Texas';
  const groups = [["Bride's family", ['Robert Carter', 'Linda Carter', 'Sophie Carter', 'Daniel Carter']], ["Groom's family", ['Michael Brooks', 'Susan Brooks', 'Ethan Brooks']], ["Bride's family", ['Grandma Rose Carter']], ['College friends', ['Olivia Reed', 'Liam Reed']], ['College friends', ['Ava Martinez', 'Noah Kim']], ["Groom's family", ['Uncle Tom Brooks', 'Aunt Helen Brooks', 'Lucas Brooks', 'Mia Brooks']], ['Work friends', ['Chloe Bennett', 'Ryan Patel', 'Grace Wilson']], ['Neighbours', ['Paul Turner', 'Anna Turner']], ['College friends', ['Isabella Nguyen', 'Jack Thompson']]];
  const meals = ['Chicken', 'Beef', 'Fish', 'Vegetarian'];
  let k = 0;
  groups.forEach(([party, names]) => { const fam = uid('f'); names.forEach((n) => { plan.guests.push({ id: uid('g'), name: n, party, fam, rsvp: k % 11 === 7 ? 'no' : k % 9 === 4 ? 'maybe' : 'yes', meal: meals[k % 4], kid: ['Mia Brooks', 'Lucas Brooks'].includes(n), table: null }); k++; }); });
  ['1', '2', '3', '4'].forEach((n, i) => plan.tables.push({ id: uid('t'), name: n, seats: 8, shape: 'round', x: 30 + i * 240, y: 30 }));
  plan.tables.push({ id: uid('t'), name: 'Head table', seats: 6, shape: 'rect', x: 30, y: 330 });
}

// ---------- wiring ----------
$('tabs').querySelectorAll('button').forEach((b) => { b.onclick = () => showTab(b.dataset.t); });
['couple', 'wdate', 'venue'].forEach((id) => $(id).addEventListener('input', (e) => { plan[{ couple: 'couple', wdate: 'date', venue: 'venue' }[id]] = e.target.value; save(); renderGuests(); }));
$('addBtn').onclick = () => { const n = addFromText($('addBox').value, $('addParty').value.trim()); if (n) { $('addBox').value = ''; renderGuests(); toast(`Added ${n} guest${n > 1 ? 's' : ''}`); } };
$('csvInBtn').onclick = () => pickFile('.csv,.txt,text/csv,text/plain', async (f) => importCsv(await f.text()));
$('gSearch').addEventListener('input', renderGuests); $('gFilter').onchange = renderGuests;
$('gBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  if (e.target.dataset.k === 'del') { const g = guestById(tr.dataset.id); if (g && confirm(`Remove ${g.name}?`)) { plan.guests = plan.guests.filter((x) => x !== g); save(); renderGuests(); } }
  else if (e.target.closest('td.name')) openGuest(tr.dataset.id);
});
$('gBody').addEventListener('change', (e) => {
  const tr = e.target.closest('tr'), g = tr && guestById(tr.dataset.id), k = e.target.dataset.k; if (!g || !k) return;
  if (k === 'table') g.table = e.target.value || null; else g[k] = e.target.value.trim();
  save(); renderGuests();
});
$('gdSave').onclick = () => { const g = editGuest; if (!g) return; g.name = $('gdName').value.trim(); g.party = $('gdParty').value.trim(); g.rsvp = $('gdRsvp').value; g.meal = $('gdMeal').value.trim(); g.kid = $('gdKid').checked; save(); $('guestDlg').close(); renderAll(); };
$('gdDel').onclick = () => { if (!editGuest) return; plan.guests = plan.guests.filter((x) => x !== editGuest); save(); $('guestDlg').close(); renderAll(); };
$('gdClose').onclick = () => $('guestDlg').close();

$('tAdd').onclick = () => addTable(1); $('tAddMany').onclick = () => addTable(5);
$('autoBtn').onclick = autoSeat;
$('uSearch').addEventListener('input', renderSeating);
// drag and drop of guests
document.addEventListener('dragstart', (e) => { const el = e.target.closest && e.target.closest('[data-g]'); if (el) { e.dataTransfer.setData('text/plain', el.dataset.g); e.dataTransfer.effectAllowed = 'move'; } });
$('room').addEventListener('dragover', (e) => { const t = e.target.closest('.tbl'); if (t) { e.preventDefault(); document.querySelectorAll('.tbl.drop').forEach((x) => x !== t && x.classList.remove('drop')); t.classList.add('drop'); } });
$('room').addEventListener('dragleave', (e) => { const t = e.target.closest('.tbl'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop'); });
$('room').addEventListener('drop', (e) => { const t = e.target.closest('.tbl'); if (!t) return; e.preventDefault(); const gid = e.dataTransfer.getData('text/plain'); const g = guestById(gid); if (!g) return; const fam = g.table ? [g] : [g]; fam.forEach((x) => seatGuest(x.id, t.dataset.t)); });
$('unseated').addEventListener('dragover', (e) => e.preventDefault());
$('unseated').addEventListener('drop', (e) => { e.preventDefault(); const gid = e.dataTransfer.getData('text/plain'); if (guestById(gid)) seatGuest(gid, null); });
$('unseated').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; selGuest = selGuest === c.dataset.g ? null : c.dataset.g; renderSeating(); if (selGuest) toast('Now click a table to seat ' + guestById(selGuest).name); });
// tables: click to seat the selected guest, drag the header to move, edit and remove names
let tdrag = null;
$('room').addEventListener('pointerdown', (e) => {
  const h = e.target.closest('[data-drag]'); if (!h || e.target.closest('button')) return;
  const t = tableById(h.dataset.drag); tdrag = { t, x: e.clientX, y: e.clientY, ox: t.x, oy: t.y, moved: false };
  h.setPointerCapture(e.pointerId);
});
$('room').addEventListener('pointermove', (e) => {
  if (!tdrag) return;
  const dx = e.clientX - tdrag.x, dy = e.clientY - tdrag.y;
  if (!tdrag.moved && Math.hypot(dx, dy) < 4) return;
  tdrag.moved = true; tdrag.t.x = Math.max(0, Math.round(tdrag.ox + dx)); tdrag.t.y = Math.max(0, Math.round(tdrag.oy + dy));
  const el = $('room').querySelector(`[data-t="${tdrag.t.id}"]`); el.style.left = tdrag.t.x + 'px'; el.style.top = tdrag.t.y + 'px';
});
$('room').addEventListener('pointerup', () => { if (tdrag && tdrag.moved) save(); tdrag = null; });
let editTable = null;
$('room').addEventListener('click', (e) => {
  const off = e.target.closest('[data-off]'); if (off) { seatGuest(off.dataset.off, null); return; }
  const ed = e.target.closest('[data-edit]'); if (ed) { const t = tableById(ed.dataset.edit); editTable = t; $('tdName').value = t.name; $('tdSeats').value = t.seats; $('tdShape').value = t.shape; $('tableDlg').showModal(); return; }
  const t = e.target.closest('.tbl'); if (t && selGuest) seatGuest(selGuest, t.dataset.t);
});
$('tdSave').onclick = () => { const t = editTable; if (!t) return; t.name = $('tdName').value.trim() || t.name; t.seats = Math.max(2, Math.min(30, Number($('tdSeats').value) || t.seats)); t.shape = $('tdShape').value; save(); $('tableDlg').close(); renderAll(); };
$('tdEmpty').onclick = () => { if (!editTable) return; plan.guests.forEach((g) => { if (g.table === editTable.id) g.table = null; }); save(); $('tableDlg').close(); renderAll(); };
$('tdDel').onclick = () => { if (!editTable) return; plan.guests.forEach((g) => { if (g.table === editTable.id) g.table = null; }); plan.tables = plan.tables.filter((t) => t !== editTable); save(); $('tableDlg').close(); renderAll(); };
$('tdClose').onclick = () => $('tableDlg').close();

// print controls
$('kinds').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; plan.print.kind = b.dataset.k; page = 0; save(); renderPrint(); });
const pset = (k, v) => { plan.print[k] = v; save(); renderPrint(); };
$('pStyle').onchange = (e) => { pset('style', e.target.value); if (st().pro && !unlocked()) toast('This style is part of Pro – you can try it here; printing it needs Pro.'); };
$('pSize').onchange = (e) => pset('size', e.target.value);
$('pChartBy').onchange = (e) => pset('chartBy', e.target.value);
$('pPaper').onchange = (e) => pset('paper', e.target.value);
$('pSheetPaper').onchange = (e) => pset('sheetPaper', e.target.value);
$('pMeal').onchange = (e) => pset('meal', e.target.checked);
$('pHeading').addEventListener('input', (e) => pset('heading', e.target.value));
$('pWords').addEventListener('input', (e) => { plan.print.words[plan.print.kind] = e.target.value; save(); renderPrint(); });
$('photoBtn').onclick = () => pickFile('image/*', async (f) => { plan.print.photo = await shrinkPhoto(f); save(); renderPrint(); });
$('photoDel').onclick = () => { plan.print.photo = ''; save(); renderPrint(); };
$('pgPrev').onclick = () => { page = Math.max(0, page - 1); renderPrint(); };
$('pgNext').onclick = () => { page += 1; renderPrint(); };
$('pPrint').onclick = printNow; $('pSave').onclick = savePicture;

// menu, backups, Pro
$('moreBtn').onclick = (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
document.addEventListener('click', () => { $('menu').hidden = true; });
$('backupBtn').onclick = () => download(new Blob([JSON.stringify({ app: 'wedpress', v: 1, plan })], { type: 'application/json' }), `${(plan.couple || 'wedding').replace(/[\\/:*?"<>|&]+/g, ' ').trim() || 'wedding'}.wedpress.json`);
$('restoreBtn2').onclick = () => pickFile('.json,application/json', async (f) => {
  try { const d = JSON.parse(await f.text()); if (d.app !== 'wedpress' || !d.plan) throw new Error('x'); if (plan.guests.length && !confirm('Replace the plan on screen with the one from this backup file?')) return; plan = normalize(d.plan); save(); renderAll(); toast('Backup opened'); }
  catch (_) { toast('That file is not a WedPress backup'); }
});
$('csvOutBtn').onclick = exportCsv;
$('sampleBtn').onclick = () => { if (plan.guests.length && !confirm('Replace your plan with the sample wedding? Save a backup first if you want to keep it.')) return; sample(); save(); renderAll(); toast('Sample wedding loaded – try ✨ Seat everyone automatically on the Seating page'); };
$('clearBtn').onclick = () => { if (!confirm('Remove all guests and tables and start again? Save a backup first if you want to keep this plan.')) return; plan = blank(); save(); renderAll(); };
$('proBtn').onclick = () => { if (!isPro) openPro(''); };
$('buyBtn').onclick = buyPro;
$('restoreBtn').onclick = async () => { proMessage('Checking your purchases…'); proMessage((await checkPro()) ? 'Pro is unlocked. ★' : 'No Pro purchase was found on this Microsoft account.'); };
$('closePro').onclick = () => $('proDialog').close();

(async () => {
  try { const p = await dbGet('plan'); if (p) plan = normalize(p); } catch (_) {}
  renderAll();
  checkPro();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
