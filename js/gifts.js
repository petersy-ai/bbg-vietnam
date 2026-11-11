// Gifts: the Saigon souvenir list as a calm, tick-it-off plan. One question answered at a time:
// what's left, where to go next, what to buy there, what to say, what to pay.
import { $, esc, store, vnNow, tripDay, metres, directionsUrl, icon } from "./util.js";

let ctx = null;
const got = store.get("gifts", {});            // item id -> true
const moved = store.get("giftsMoved", {});     // item id -> index into its stops (after "not here")
let custom = store.get("giftsCustom", []);     // [{ id, text }]
let seg = store.get("giftsSeg", "stops");
let quote = "";
let sheet = null;                               // which sheet is open: { stop } or { item }

const G = () => ctx.D.gifts;
const save = () => { store.set("gifts", got); store.set("giftsMoved", moved); store.set("giftsCustom", custom); };
const stopById = id => G().stops.find(s => s.id === id);
const clock = s => { if (!s) return null; const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const fmtK = v => v >= 1e6 ? `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M` : `${Math.round(v / 1000)}k`;
const aud = v => `A$${Math.max(1, Math.round(v / G().aud))}`;
const round5k = v => Math.round(v / 5000) * 5000;

export function initGifts(c) {
  ctx = c;
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", onKey);
}

// ---------- the model ----------
function currentStop(item) {
  const i = moved[item.id] || 0;
  return item.stops[i] || null; // null = every idea tried
}
function needed() { return G().items.filter(i => !i.optional); }
function progress() {
  const req = needed(), all = req.length + custom.length;
  const n = req.filter(i => got[i.id]).length + custom.filter(c => got[c.id]).length;
  return { n, all, left: all - n };
}
// What's still to buy at each stop, keyed by stop id.
function plan() {
  const by = {};
  for (const it of G().items) {
    if (got[it.id]) continue;
    const s = currentStop(it);
    (by[s || "_none"] ||= []).push(it);
  }
  return by;
}
function stopState(s, now, today) {
  const o = clock(s.open), c = clock(s.close);
  if (s.id === "mekong") return today === 12 && now.min < c ? { open: true, label: "On today's tour", short: "Today" } : { open: false, label: "On the tour, Thu 12", short: "Thu tour" };
  if (o == null) return { open: null, label: "Ring first", short: "Ring first" };
  if (now.min < o) return { open: false, label: `Opens ${s.open}`, short: `Opens ${s.open}` };
  if (now.min >= c) return { open: false, label: "Closed for today", short: "Closed" };
  const left = c - now.min, soon = left <= 90;
  const inW = left < 60 ? `${left} min` : `1 h${left > 60 ? ` ${left - 60} min` : ""}`;
  return { open: true, soon, label: soon ? `Closes in ${inW}` : `Open till ${s.close}`, short: soon ? `Shuts ${s.close}` : `Till ${s.close}` };
}
function walkMins(s) {
  const p = s.place && ctx.D.places[s.place];
  if (!p || p.lat == null) return null;
  const pos = ctx.getPos(), home = ctx.D.places["hotel:hcmc"];
  const from = pos || (home ? [home.lng, home.lat] : null);
  if (!from) return null;
  return Math.max(1, Math.round(metres(from, [p.lng, p.lat]) * 1.3 / 80));
}
// The single next place to go, or a reason there isn't one.
function next(now, today) {
  const by = plan();
  if (today < 11) return { wait: "Shopping starts in Saigon, Wednesday afternoon." };
  if (today > 14) return { wait: "The trip's over. Hope they loved them." };
  if (today === 11 && now.min < 15 * 60) return { wait: "Starts after check-in, about 15:00.", first: "benthanh" };
  const order = G().stops.map((s, i) => ({ s, i, items: by[s.id] || [] })).filter(x => x.items.length);
  if (!order.length) return { done: true };
  const ranked = order
    .map(x => ({ ...x, st: stopState(x.s, now, today) }))
    .filter(x => x.st.open !== false)
    .sort((a, b) => (b.s.day === today) - (a.s.day === today) || (b.st.soon ? 1 : 0) - (a.st.soon ? 1 : 0) || (a.s.day <= today ? 0 : 1) - (b.s.day <= today ? 0 : 1) || a.i - b.i);
  if (!ranked.length) return { wait: today < 14 ? "Everything on the list is shut for tonight. Tomorrow's plan is below." : "Everything's shut. What's left can wait." };
  const top = ranked[0];
  return { stop: top.s, items: top.items, st: top.st, then: top.s.id === "mekong" ? null : ranked[1]?.s }; // no "then" while on the tour
}

export function giftsSummary() {
  const p = progress(), now = vnNow(), today = tripDay(now);
  const n = next(now, today);
  return { ...p, next: n.stop?.name || null };
}

// ---------- rendering ----------
export function renderGifts() {
  const v = $("#view"), now = vnNow(), today = tripDay(now);
  const p = progress(), n = next(now, today);
  const day = G().days.find(d => d.d === today) || (today < 11 ? G().days[0] : null);
  const pct = p.all ? p.n / p.all : 0, R = 30, C = 2 * Math.PI * R;
  v.innerHTML = `
    <div class="eyebrow">Saigon · 11–14 Nov</div>
    <h1 class="large-title">Gifts</h1>
    <div class="g-hero">
      <div class="g-ring" role="img" aria-label="${p.n} of ${p.all} sorted">
        <svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="${R}" class="trk"/><circle cx="38" cy="38" r="${R}" class="val" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
        <span>${p.n}<small>/${p.all}</small></span>
      </div>
      <div class="g-hero-t">
        <b>${p.left ? `${p.left} to go` : "All sorted"}</b>
        <span>${p.left ? esc(day ? day.title : "") : "Everything's bought. Go on then."}</span>
        ${p.left && today >= 11 && today <= 14 ? `<span class="g-calm">${calm(today)}</span>` : ""}
      </div>
    </div>
    ${nextCard(n, today)}
    <div class="seg" role="group" aria-label="Gift views">${[["stops", "Stops"], ["people", "People"], ["haggle", "Haggle"]].map(([k, l]) => `<button data-gseg="${k}" aria-pressed="${seg === k}">${l}</button>`).join("")}</div>
    <div id="gBody">${body(now, today)}</div>`;
}

function calm(today) {
  const windows = G().days.filter(d => d.d >= today).length;
  return windows > 1 ? `${windows} shopping windows left. Plenty of time.` : "Last window. Only what's left.";
}

function nextCard(n, today) {
  if (n.done) return `<div class="g-next done"><span class="k">All done</span><span class="t">Every gift's sorted</span><span class="s">Check “Before you fly” under Haggle, then relax.</span></div>`;
  if (n.wait) {
    const first = n.first && stopById(n.first);
    return `<div class="g-next quiet"><span class="k">Next</span><span class="t">${esc(n.wait)}</span>${first ? `<span class="s">First stop: ${esc(first.name)}, before its stalls close at 17:00.</span>` : ""}</div>`;
  }
  const s = n.stop, w = walkMins(s), p = s.place && ctx.D.places[s.place];
  return `<div class="g-next">
    <span class="k">Next stop</span>
    <span class="t">${esc(s.name)}</span>
    <span class="s">${[w ? `${w} min walk` : esc(s.where), n.st.label].filter(Boolean).map(esc).join(" · ")}</span>
    <div class="g-chips">${n.items.map(i => `<span>${esc(i.what)}</span>`).join("")}</div>
    <div class="btnrow">
      ${p ? `<a class="btn g-go" href="${directionsUrl(p)}" target="_blank" rel="noopener">${icon("nav")} Go</a>` : `<span class="btn g-go">${icon("map")} With the tour</span>`}
      <button class="btn g-what" data-gstop="${s.id}">What to buy ${icon("chev")}</button>
    </div>
    ${n.then ? `<span class="then">Then ${esc(n.then.name)}</span>` : ""}
  </div>`;
}

function body(now, today) {
  if (seg === "people") return people();
  if (seg === "haggle") return haggle();
  return stops(now, today);
}

function stops(now, today) {
  const by = plan();
  const days = G().days.map(d => {
    const list = G().stops.filter(s => s.day === d.d && (by[s.id]?.length || G().items.some(i => i.stops[0] === s.id)));
    if (!list.length) return "";
    const rows = list.map((s, i) => {
      const left = by[s.id] || [], st = stopState(s, now, today), w = walkMins(s);
      const doneHere = !left.length;
      const pill = doneHere ? `<span class="g-pill ok">Done</span>` : today === d.d || (today > 11 && today <= 14) ? `<span class="g-pill${st.open ? (st.soon ? " soon" : " open") : ""}">${esc(st.short)}</span>` : "";
      return `<button type="button" class="row g-row${doneHere ? " done" : ""}" data-gstop="${s.id}">
        <span class="g-num">${doneHere ? icon("check") : i + 1}</span>
        <span class="txt"><b>${esc(s.name)}</b><span>${doneHere ? "Nothing left here" : esc(left.map(x => x.what).join(" · "))}${w && !doneHere ? ` · ${w} min` : ""}</span></span>
        <span class="meta">${pill}${icon("chev")}</span></button>`;
    }).join("");
    return `<div class="section-h"><h2>${esc(d.title)}</h2></div><p class="g-line">${esc(d.line)}</p><div class="list">${rows}</div>`;
  }).join("");
  const stray = by._none || [];
  return days + (stray.length ? `<div class="section-h"><h2>No shop yet</h2></div><p class="g-line">Every idea tried. Ask at Bến Thành or Saigon Square on Saturday.</p><div class="list">${stray.map(itemRow).join("")}</div>` : "");
}

function itemRow(it) {
  const s = stopById(currentStop(it) || "");
  const on = !!got[it.id];
  return `<div class="row g-item${on ? " done" : ""}">
    <button type="button" class="tick" data-gtick="${it.id}" aria-label="${on ? "Untick" : "Tick"} ${esc(it.what)}">${on ? icon("check") : ""}</button>
    <button type="button" class="txt g-open" data-gitem="${it.id}"><b>${esc(it.what)}${it.optional ? ` <i>optional</i>` : ""}</b><span>${esc([it.detail, s ? s.name : "No shop yet", it.pay].filter(Boolean).join(" · "))}</span></button>
  </div>`;
}

function people() {
  const groups = G().who.map(w => {
    const items = G().items.filter(i => i.who === w.id);
    if (!items.length) return "";
    const left = items.filter(i => !got[i.id] && !i.optional).length;
    return `<div class="section-h"><h2>${esc(w.label)}${w.sub ? ` <small>${esc(w.sub)}</small>` : ""}</h2>${left ? "" : `<span class="g-pill ok">Done</span>`}</div><div class="list">${items.map(itemRow).join("")}</div>`;
  }).join("");
  const mine = custom.map(c => { const on = !!got[c.id]; return `<div class="row g-item${on ? " done" : ""}">
      <button type="button" class="tick" data-gtick="${c.id}" aria-label="${on ? "Untick" : "Tick"} ${esc(c.text)}">${on ? icon("check") : ""}</button>
      <span class="txt"><b>${esc(c.text)}</b></span>
      <button type="button" class="g-del" data-gdel="${c.id}" aria-label="Remove ${esc(c.text)}">×</button></div>`; }).join("");
  return `${groups}
    <div class="section-h"><h2>Anything else</h2></div>
    <div class="list">${mine}<label class="row g-add"><span class="g-plus">+</span><input id="gAdd" type="text" placeholder="Add something you remembered" enterkeyhint="done" autocomplete="off"></label></div>
    ${sizes()}`;
}

function sizes() {
  return `<div class="section-h"><h2>The boys' sizes</h2></div>
    <div class="list g-sizes">
      <div class="row"><span class="txt"><b>The 7-year-old</b><span>Market tag 130 · Nike tag XS</span></span></div>
      <div class="row"><span class="txt"><b>The 10-year-old</b><span>Market tag 140 (150 if it runs small) · Nike tag M</span></span></div>
    </div>
    <p class="g-line">Market stock goes by height in cm. Not sure? Buy the bigger size.</p>`;
}

function haggle() {
  const v = parseQuote(quote);
  const res = v ? `<div class="g-res">
      <div><span>Offer</span><b>${fmtK(round5k(v * 0.45))}</b><small>${aud(v * 0.45)}</small></div>
      <div class="mid"><span>Happy at</span><b>${fmtK(round5k(v * 0.5))}–${fmtK(round5k(v * 0.65))}</b><small>${aud(v * 0.5)}–${aud(v * 0.65)}</small></div>
      <div><span>Walk away over</span><b>${fmtK(round5k(v * 0.7))}</b><small>${aud(v * 0.7)}</small></div>
    </div>` : `<p class="g-line">Type what they said. “250” means 250k.</p>`;
  const say = G().say;
  return `<div class="section-h"><h2>They said…</h2></div>
    <label class="g-quote"><input id="gQuote" type="text" inputmode="decimal" placeholder="250" value="${esc(quote)}" autocomplete="off"><span>k VND</span></label>
    <div id="gRes">${res}</div>
    <p class="g-line">Price tags mean no haggling: FO76, Miniso, youOn, Vascara, Charles &amp; Keith, Eco Craft, Co.opmart, Nhasilk.</p>
    <div class="section-h"><h2>Show the seller</h2></div>
    <div class="g-say">${["howmuch", "lower", "toomuch", "three", "kids", "size", "nike", "thanks"].map(k => `<button type="button" data-gsay="${k}"><b>${esc(say[k][0])}</b><span>${esc(say[k][1])}</span></button>`).join("")}</div>
    <div class="section-h"><h2>Four moves</h2></div>
    <ol class="g-moves"><li>Ask the price, look a bit disappointed, offer the number above.</li><li>Buy three or four things from one stall for a better price.</li><li>If it stalls, say thanks and walk. Being called back is the real price.</li><li>Pay with small notes. Keep 500k notes hidden: they look like 20k.</li></ol>
    <div class="section-h"><h2>Before you fly</h2></div>
    <div class="list">${G().fly.map((t, i) => { const id = `fly${i}`, on = !!got[id]; return `<div class="row g-item${on ? " done" : ""}"><button type="button" class="tick" data-gtick="${id}" aria-label="${on ? "Untick" : "Tick"}">${on ? icon("check") : ""}</button><span class="txt"><b>${esc(t)}</b></span></div>`; }).join("")}</div>`;
}
function parseQuote(s) {
  const t = String(s).trim().toLowerCase().replace(/,/g, "");
  if (!t) return 0;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(m|k)?$/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2] === "m") n *= 1e6; else if (m[2] === "k" || n <= 5000) n *= 1000;
  return n;
}

// ---------- sheets ----------
function openStop(id) {
  sheet = { stop: id };
  const s = stopById(id), now = vnNow(), today = tripDay(now);
  // Bought items stay in the list, ticked, so a mis-tap is easy to undo; things already tried here don't come back.
  const here = G().items.filter(i => currentStop(i) === id).sort((a, b) => !!got[a.id] - !!got[b.id]);
  const maybe = G().items.filter(i => !got[i.id] && currentStop(i) !== id && i.stops.indexOf(id) > (moved[i.id] || 0));
  const st = stopState(s, now, today), p = s.place && ctx.D.places[s.place], w = walkMins(s);
  ctx.openModal(`<div class="detail">
    <div class="eyebrow">${s.haggle ? "Haggle here" : "Price tags here"}${w ? ` · ${w} min walk` : ""}</div>
    <h2 class="title2" id="modalTitle">${esc(s.name)}</h2>
    <div class="vi">${esc(s.where)}</div>
    <div class="badges"><span class="badge${st.open ? " ok" : ""}">${esc(st.label)}</span></div>
    <p class="line">${esc(s.note)}</p>
    <div class="section-h"><h2>Buy here</h2></div>
    ${here.length ? `<div class="list">${here.map(i => sheetItem(i, true)).join("")}</div>` : `<p class="g-line">Nothing to buy here any more.</p>`}
    ${maybe.length ? `<div class="section-h"><h2>Also here, if you see it</h2></div><div class="list">${maybe.map(i => sheetItem(i, false)).join("")}</div>` : ""}
    ${p ? `<div class="btnrow" style="margin-top:14px"><a class="btn-primary" href="${directionsUrl(p)}" target="_blank" rel="noopener">${icon("nav")} Directions</a><button class="btn" data-act="driver" data-pid="${esc(s.place)}">${icon("car")} Show driver</button></div>` : ""}
    ${s.phone ? `<a class="btn-tint" style="margin-top:8px" href="tel:${esc(s.phone)}">${icon("phone")} Ring them first</a>` : ""}
  </div>`);
}
function sheetItem(it, primary) {
  const on = !!got[it.id], alts = it.stops.slice((moved[it.id] || 0) + 1).map(stopById);
  return `<div class="g-sheet-item${on ? " done" : ""}">
    <div class="row g-item"><button type="button" class="tick" data-gtick="${it.id}" aria-label="${on ? "Untick" : "Tick"} ${esc(it.what)}">${on ? icon("check") : ""}</button>
      <span class="txt"><b>${esc(it.what)}</b><span>${esc([it.detail, `Pay ${it.pay}`].filter(Boolean).join(" · "))}</span></span></div>
    ${it.check ? `<p class="g-check">${esc(it.check)}</p>` : ""}
    <div class="g-sayrow">${it.say.map(k => `<button type="button" data-gsay="${k}">${esc(G().say[k][0])}</button>`).join("")}
      ${primary && alts.length && !on ? `<button type="button" class="g-not" data-gnot="${it.id}">Not here → ${esc(alts[0].name)}</button>` : ""}</div>
  </div>`;
}
function openItem(id) {
  sheet = { item: id };
  const it = G().items.find(i => i.id === id), cur = currentStop(it);
  ctx.openModal(`<div class="detail">
    <div class="eyebrow">${esc(G().who.find(w => w.id === it.who).label)}</div>
    <h2 class="title2" id="modalTitle">${esc(it.what)}</h2>
    ${it.detail ? `<div class="vi">${esc(it.detail)}</div>` : ""}
    <dl class="kv"><div><dt>Pay</dt><dd>${esc(it.pay)}</dd></div>${it.quote ? `<div><dt>First price</dt><dd>Usually about ${it.quote}k</dd></div>` : ""}${it.check ? `<div><dt>Check</dt><dd>${esc(it.check)}</dd></div>` : ""}</dl>
    <div class="section-h"><h2>Buy it at</h2></div>
    <div class="g-where">${it.stops.map((sid, i) => { const s = stopById(sid); const d = G().days.find(x => x.d === s.day); return `<button type="button" data-gpick="${it.id}:${i}" aria-pressed="${sid === cur}"><b>${esc(s.name)}</b><span>${esc(d ? d.title.split(":")[0] : "")}</span></button>`; }).join("")}</div>
    ${it.say.length ? `<div class="section-h"><h2>Show the seller</h2></div><div class="g-sayrow">${it.say.map(k => `<button type="button" data-gsay="${k}">${esc(G().say[k][0])}</button>`).join("")}</div>` : ""}
    <button class="btn-primary" style="margin-top:16px" data-gtick="${it.id}" data-gclose>${got[it.id] ? "Not bought after all" : `${icon("check")} Got it`}</button>
  </div>`);
}

// ---------- events ----------
function refresh(keepModal) {
  save();
  if (ctx.tab() === "gifts") {
    const y = window.scrollY; renderGifts(); window.scrollTo(0, y);
  }
  if (keepModal?.stop) openStop(keepModal.stop);
}
function onClick(e) {
  const t = e.target.closest("[data-gseg],[data-gstop],[data-gitem],[data-gtick],[data-gsay],[data-gnot],[data-gpick],[data-gdel]");
  if (!t) return;
  const ds = t.dataset;
  e.preventDefault(); e.stopPropagation();
  const sheetStop = !$("#modal").hidden && sheet?.stop ? sheet.stop : null;
  if (ds.gseg) { seg = ds.gseg; store.set("giftsSeg", seg); return renderGifts(); }
  if (ds.gsay) { const [vi, en] = G().say[ds.gsay]; return ctx.say(vi, en); }
  if (ds.gtick) {
    got[ds.gtick] ? delete got[ds.gtick] : got[ds.gtick] = true;
    if ("gclose" in ds) ctx.closeModal();
    const p = progress();
    if (got[ds.gtick] && !p.left) ctx.toast("Every gift's sorted. Go on then.");
    return refresh(sheetStop ? { stop: sheetStop } : null);
  }
  if (ds.gnot) {
    const it = G().items.find(i => i.id === ds.gnot);
    moved[it.id] = (moved[it.id] || 0) + 1;
    const nx = currentStop(it);
    ctx.toast(nx ? `Moved to ${stopById(nx).name}.` : "Every idea tried. It's on the list for Saturday.");
    return refresh(sheetStop ? { stop: sheetStop } : null);
  }
  if (ds.gpick) { const [id, i] = ds.gpick.split(":"); moved[id] = +i; ctx.closeModal(); return refresh(); }
  if (ds.gdel) { custom = custom.filter(c => c.id !== ds.gdel); delete got[ds.gdel]; return refresh(); }
  if (ds.gstop) return openStop(ds.gstop);
  if (ds.gitem) return openItem(ds.gitem);
}
function onInput(e) {
  if (e.target.id !== "gQuote") return;
  quote = e.target.value;
  const r = $("#gRes"); if (!r) return;
  const tmp = document.createElement("div"); tmp.innerHTML = haggle();
  r.innerHTML = tmp.querySelector("#gRes").innerHTML;
}
function onKey(e) {
  if (e.target.id !== "gAdd" || e.key !== "Enter") return;
  const text = e.target.value.trim();
  if (!text) return;
  custom.push({ id: `c${Date.now()}`, text });
  save(); renderGifts();
  setTimeout(() => $("#gAdd")?.focus(), 0);
}
