// Basic Bitch Guide to Vietnam: app shell, Now, Trip, Help, detail sheets and posters.
import { $, esc, md, store, vnNow, tripDay, daysUntilTrip, period, parseClock, inWords, metres, distLabel,
  directionsUrl, appleMapsUrl, icon, CATS, catOf, badgesHTML } from "./util.js";
import { loadBlob, unlockSaved, unlockWith, forgetKey } from "./crypto.js";
import { initMap, showMap, saveMapsOffline } from "./map.js";

let D = null;
const ui = { tab: "now", trip: { seg: "days", day: null, stop: null, dish: "ok" } };
const done = store.get("done", {});
const facts = store.get("facts", {});    // id -> "boring" | "goon" | "deep"
let factNow = null, factStage = 0;          // current deck card and how far it's been opened
let pos = null;
let ticker = null;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ================= boot =================
boot();
async function boot() {
  registerSW();
  let blob;
  try { blob = await loadBlob(); } catch { return showLock("Couldn't load the trip data. Open the app once with signal, then it works offline."); }
  const data = await unlockSaved(blob);
  if (data) return start(data);
  showLock();
  $("#lockForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#unlockBtn"), err = $("#lockErr");
    btn.disabled = true; btn.textContent = "Unlocking…"; err.textContent = "";
    try { start(await unlockWith($("#pass").value, blob)); }
    catch { err.textContent = "That passphrase didn't work. Check it and try again."; }
    finally { btn.disabled = false; btn.textContent = "Unlock"; }
  });
}
function showLock(msg) {
  $("#lock").hidden = false; $("#app").hidden = true;
  if (msg) $("#lockErr").textContent = msg;
  setTimeout(() => $("#pass")?.focus(), 50);
}

function start(data) {
  D = data;
  D.cardList = Object.values(D.cards);
  $("#lock").hidden = true; $("#app").hidden = false;
  initMap({ D, currentStop, openCard, openPlace, setPos: p => { pos = p; } });
  watchPosition();
  wire();
  go(store.get("tab", "now"));
  ticker = setInterval(() => { if (ui.tab === "now" && $("#modal").hidden) renderNow(true); }, 30000);
}

function watchPosition() {
  // Only ask for location if it was granted before; the map's locate button asks the first time.
  navigator.permissions?.query({ name: "geolocation" }).then(p => {
    if (p.state !== "granted") return;
    navigator.geolocation.watchPosition(g => { pos = [g.coords.longitude, g.coords.latitude]; }, () => {}, { maximumAge: 60000 });
  }).catch(() => {});
}

// ================= data helpers =================
const today = () => tripDay();
const dayObj = d => D.days.find(x => x.d === d);
function currentStop() {
  const d = today();
  if (d >= 1 && d <= 14) { const day = dayObj(d), now = vnNow(); return now.min > 15 * 60 ? day.stops[day.stops.length - 1] : day.stops[0]; }
  return d === 0 ? D.days[0].stops[0] : D.days[13].stops[0];
}
const stopObj = id => D.stops.find(s => s.id === id);
const placeOf = c => c && c.place ? D.places[c.place] : null;
function distTo(c) { const p = placeOf(c); return pos && p && p.lat != null ? metres(pos, [p.lng, p.lat]) : null; }
function dateLabel(d) { const day = dayObj(d); return `${day.dow} ${d} Nov`; }

// ================= navigation =================
function wire() {
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closePoster(); closeModal(); } });
}
function go(tab) {
  ui.tab = tab; store.set("tab", tab);
  document.querySelectorAll(".tabbar button").forEach(b => b.dataset.tab === tab ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  document.body.classList.toggle("map-on", tab === "map");
  $("#view").hidden = tab === "map";
  $("#mapView").hidden = tab !== "map";
  if (tab === "now") renderNow();
  else if (tab === "trip") renderTrip();
  else showMap({});
  if (tab !== "map") window.scrollTo(0, 0);
}

function onClick(e) {
  const t = e.target.closest("[data-tab],[data-card],[data-place],[data-act],[data-close],[data-day],[data-seg],[data-stop],[data-dish],[data-done],[data-phrase],[data-fact]");
  if (!t) return;
  const ds = t.dataset;
  if (ds.tab) return go(ds.tab);
  if ("close" in ds) return closeModal();
  if (ds.card) return openCard(ds.card);
  if (ds.place) return openPlace(ds.place);
  if (ds.day) { ui.trip.day = +ds.day; ui.trip.seg = "days"; if (ui.tab !== "trip") go("trip"); else renderTrip(); return window.scrollTo(0, 0); }
  if (ds.seg) { ui.trip.seg = ds.seg; ui.trip.day = null; ui.trip.stop = null; return renderTrip(); }
  if (ds.stop) { ui.trip.stop = ds.stop; renderTrip(); return window.scrollTo(0, 0); }
  if (ds.dish) { ui.trip.dish = ds.dish; return renderTrip(); }
  if (ds.done) {
    done[ds.done] ? delete done[ds.done] : done[ds.done] = 1; store.set("done", done);
    const on = !!done[ds.done];
    t.classList.toggle("done", on);
    const tick = t.querySelector(".tick"); if (tick) tick.innerHTML = on ? icon("check") : "";
    if (ds.done.startsWith("pack.")) packCounts();
    return;
  }
  if (ds.phrase) return poster("phrase", +ds.phrase);
  if (ds.fact) return factAction(ds.fact);
  if (ds.act) return act(ds.act, t);
}

function act(a, t) {
  const ds = t.dataset;
  switch (a) {
    case "help": return openHelp();
    case "foodcard": return poster("food");
    case "driver": return poster("driver", ds.pid);
    case "home": { const pid = tonightHotel(); return pid ? openPlace(pid) : toast("No hotel tonight: you're on the move."); }
    case "phrases": return openPhrases();
    case "contact": return openContact();
    case "unwell": return openUnwell();
    case "copy": return copy(ds.text);
    case "showmap": closeModal(); go("map"); return showMap({ place: ds.pid, stop: ds.stop });
    case "back": ui.trip.day = null; ui.trip.stop = null; renderTrip(); return window.scrollTo(0, 0);
    case "packing": ui.trip.seg = "prep"; ui.trip.day = null; ui.trip.stop = null; go("trip"); return document.getElementById("packing")?.scrollIntoView();
    case "closeposter": return closePoster();
    case "savemaps": return saveMaps(t);
    case "lock": forgetKey(); location.reload(); return;
    case "resetfacts": for (const k in facts) delete facts[k]; store.set("facts", facts); factNow = null; renderTrip(); return toast("Fact score reset.");
  }
}
$("#helpBtn").addEventListener("click", openHelp);

// ================= NOW =================
function renderNow(soft) {
  const d = today(), now = vnNow();
  const v = $("#view");
  if (d === 0) v.innerHTML = nowBefore(now);
  else if (d === 15) v.innerHTML = vibeReport(true);
  else v.innerHTML = nowDuring(d, now);
  if (!soft) window.scrollTo(0, 0);
}

function nowBefore(now) {
  const n = daysUntilTrip(now);
  const todos = D.todos.map(id => D.cards[id]);
  const urgent = D.cardList.filter(c => c.urgent && c.kind !== "fact" && (c.days || []).some(x => x <= 2) && !D.todos.includes(c.id));
  return `
    <div class="eyebrow">${esc(DOW[new Date(now.ms + 7 * 3600e3).getUTCDay()])} ${now.d} ${now.m === 9 ? "Oct" : "Nov"} · Before the trip</div>
    <h1 class="large-title">${n === 1 ? "Tomorrow" : `${n} days to go`}</h1>
    <p class="vibe">Today's vibe: <b>packing cubes and lactase tablets.</b></p>
    <div class="hero"><span class="k">First stop</span><span class="t">Hanoi ${n === 1 ? "tomorrow" : `in ${n} days`}</span>
      <span class="s">VN256 lands 22:40, Sun 1 Nov. A driver meets you.</span></div>
    ${section("Before you go", rows(todos, { check: true }))}
    <div class="list" style="margin-top:10px"><button type="button" class="row" data-act="packing"><span class="ic">${icon("shop")}</span><span class="txt"><b>Packing list</b><span>${esc(packProgress())}</span></span><span class="meta">${icon("chev")}</span></button></div>
    ${urgent.length ? section("Heads up for the first days", rows(urgent)) : ""}
    <div style="margin-top:26px">${factCard()}</div>
    <button class="btn-tint" style="margin-top:14px" data-day="1">Preview day 1 ${icon("chev")}</button>`;
}

function nowDuring(d, now) {
  const day = dayObj(d);
  const plan = day.plan.map(p => ({ ...p, at: parseClock(p.time) }));
  const upcoming = plan.filter(p => p.at != null && p.at >= now.min - 10);
  const next = upcoming[0], then = upcoming[1];
  let hero;
  if (next) {
    hero = `<div class="hero"><span class="k">Next up · ${esc(next.time)}</span><span class="t${next.text.length > 40 ? " long" : ""}">${esc(next.text)}</span>
      <span class="s count">${esc(inWords(next.at - now.min))}</span>
      ${then ? `<span class="then">Then ${esc(then.time)} · ${esc(then.text)}</span>` : ""}</div>`;
  } else {
    const tm = d < 14 ? dayObj(d + 1) : null, first = tm?.plan.find(p => parseClock(p.time) != null);
    hero = `<div class="hero"><span class="k">${now.min > 18 * 60 ? "Tonight" : "Right now"}</span><span class="t">Nothing booked. Your time.</span>
      ${first ? `<span class="then">Tomorrow ${esc(first.time)} · ${esc(first.text)}</span>` : `<span class="then">Last day. Make it count.</span>`}</div>`;
  }
  const urgent = D.cardList.filter(c => c.urgent && c.kind !== "fact" && (c.days || []).includes(d));
  const stopIds = day.stops;
  const per = period(now.min);
  const local = D.cardList.filter(c => stopIds.includes(c.stop) && ["food", "do", "tailor"].includes(c.kind) && !c.backup);
  const pinned = local.filter(c => placeOf(c)?.lat != null);
  let near = pinned.length ? pinned : local;
  const withDist = near.map(c => ({ c, m: distTo(c) }));
  const useDist = withDist.some(x => x.m != null && x.m < 15000);
  const fitsNow = c => !(c.tod || []).length || c.tod.includes(per);
  if (useDist) {
    const byDist = withDist.filter(x => x.m != null).sort((a, b) => a.m - b.m).map(x => x.c);
    near = [...byDist.filter(fitsNow), ...byDist.filter(c => !fitsNow(c))];
  }
  else near = near.map(c => ({ c, s: ((c.days || []).includes(d) ? 3 : 0) + ((c.tod || []).includes(per) ? 2 : 0) + (c.vibes ? 1 : 0) + (c.stop === currentStop() ? 1 : 0) }))
    .sort((a, b) => b.s - a.s).map(x => x.c);
  const hotel = day.hotel && D.places[day.hotel];
  return `
    <div class="eyebrow">${esc(dateLabel(d))} · ${esc(stopObj(currentStop())?.name || "")}</div>
    <h1 class="large-title">Now</h1>
    <p class="vibe">Today's vibe: <b>${esc(day.vibe)}</b></p>
    ${hero}
    ${urgent.length ? section("Heads up", rows(urgent, { check: true })) : ""}
    ${section(useDist ? "Near you" : `Around ${stopObj(currentStop())?.short || ""}`, rows(near.slice(0, 5), { dist: useDist }), `<button data-tab="map">Map</button>`)}
    <div style="margin-top:26px">${factCard()}</div>
    ${hotel ? section("Tonight", `<div class="list"><button class="row" data-place="${esc(day.hotel)}"><span class="ic">${icon("home")}</span><span class="txt"><b>${esc(hotel.name)}</b><span>${esc(hotel.address_vi || "")}</span></span><span class="meta">${icon("chev")}</span></button></div>`) : ""}
    <button class="btn-tint" style="margin-top:18px" data-day="${d}">All of day ${d} ${icon("chev")}</button>`;
}

function section(title, body, extra = "") {
  return `<div class="section-h"><h2>${esc(title)}</h2>${extra}</div>${body}`;
}

function rows(cards, { check = false, dist = false } = {}) {
  if (!cards.length) return `<p class="empty">Nothing here.</p>`;
  return `<div class="list">${cards.map(c => {
    const cat = CATS[catOf(c)] || CATS.practical;
    const isDone = !!done[c.id];
    const lead = check
      ? `<span class="tick" data-done-tick>${isDone ? icon("check") : ""}</span>`
      : `<span class="ic" style="background:${cat.color}22;color:${cat.color}">${icon(c.kind === "watch" ? "watch" : cat.icon)}</span>`;
    const meta = dist ? distLabel(distTo(c)) : "";
    const title = c.kind === "fact" ? c.hook : c.title;
    const sub = c.kind === "fact" ? (c.deploy || "") : (c.line || "");
    return `<button type="button" class="row${c.urgent ? " urgent" : ""}${check && isDone ? " done" : ""}${c.kind === "fact" ? " factrow" : ""}" ${check ? `data-donerow="${esc(c.id)}"` : ""} data-card="${esc(c.id)}">
      ${lead}<span class="txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span><span class="meta">${esc(meta)}${icon("chev")}</span></button>`;
  }).join("")}</div>`;
}
// A tap on the round tick toggles done; anywhere else on the row opens the card.
document.addEventListener("click", e => {
  const tick = e.target.closest("[data-done-tick]");
  if (!tick) return;
  e.stopPropagation(); e.preventDefault();
  const row = tick.closest("[data-donerow]"), id = row.dataset.donerow;
  done[id] ? delete done[id] : done[id] = 1; store.set("done", done);
  row.classList.toggle("done", !!done[id]); tick.innerHTML = done[id] ? icon("check") : "";
}, true);

// ================= the fact deck =================
function factDeck() {
  const d = today(), stops = d >= 1 && d <= 14 ? dayObj(d).stops : ["whole"];
  const all = D.cardList.filter(c => c.kind === "fact");
  const score = c => ((c.days || []).includes(d) ? 4 : 0) + (stops.includes(c.stop) ? 2 : 0) + (c.stop === "whole" ? 1 : 0);
  return all.filter(c => !facts[c.id]).sort((a, b) => score(b) - score(a));
}
function factCard() {
  if (!factNow || facts[factNow] && factStage === 0) { factNow = factDeck()[0]?.id || null; factStage = 0; }
  const c = factNow && D.cards[factNow];
  const tally = Object.values(facts), ok = tally.filter(v => v !== "boring").length, no = tally.length - ok;
  const score = tally.length ? `<div class="score">Tolerated ${ok} · Boring ${no}</div>` : "";
  if (!c) return `<div class="fact"><p class="hook">That's every fact. The vibe report is in Trip → Prep.</p>${score}</div>`;
  const body = [];
  if (factStage >= 1) body.push(`<p class="body">${md(c.fact)}</p>`);
  if (factStage >= 2 && c.actually) body.push(`<p class="body"><b>Actually… </b>${md(c.actually)}</p>`);
  const acts = factStage === 0
    ? `<div class="acts"><button class="btn" data-fact="boring">Boring</button><button class="btn-primary" data-fact="goon">Go on then</button></div>`
    : `<div class="acts">${factStage === 1 && c.actually ? `<button class="btn-tint" data-fact="deep">Actually…</button>` : `<span></span>`}<button class="btn" data-fact="next">Next fact</button></div>`;
  return `<div class="fact" id="factCard"><div class="k">Unsolicited fact${c.myth ? `<span class="myth">Myth-buster</span>` : ""}</div>
    <p class="hook">${esc(c.hook)}</p>${body.join("")}
    ${c.deploy ? `<div class="where">${esc(c.deploy)}${c.confidence === "debated" ? " · sources disagree" : ""}</div>` : ""}
    ${acts}${score}</div>`;
}
function factAction(a) {
  if (!factNow) return;
  if (a === "boring") { facts[factNow] = "boring"; factNow = null; }
  else if (a === "goon") { facts[factNow] = "goon"; factStage = 1; }
  else if (a === "deep") { facts[factNow] = "deep"; factStage = 2; }
  else if (a === "next") { factNow = null; factStage = 0; }
  store.set("facts", facts);
  const el = $("#factCard");
  if (el) el.outerHTML = factCard();
}

// ================= TRIP =================
function renderTrip() {
  const t = ui.trip, v = $("#view");
  if (t.day) { v.innerHTML = dayDetail(t.day); return; }
  if (t.stop) { v.innerHTML = stopDetail(t.stop); return; }
  const segs = [["days", "Days"], ["places", "Places"], ["eat", "Eat safe"], ["prep", "Prep"]];
  const head = `<div class="eyebrow">1–14 Nov 2026</div><h1 class="large-title">Trip</h1>
    <div class="seg" role="group" aria-label="Trip sections">${segs.map(([k, l]) => `<button data-seg="${k}" aria-pressed="${t.seg === k}">${l}</button>`).join("")}</div>`;
  const body = { days: tripDays, places: tripPlaces, eat: tripEat, prep: tripPrep }[t.seg]();
  v.innerHTML = head + body;
}

function tripDays() {
  const d = today();
  return `<div class="days">${D.days.map(x => `<button class="day${x.d === d ? " today" : ""}${d && x.d < d ? " past" : ""}" data-day="${x.d}">
    <span class="num"><small>${esc(x.dow)}</small><b>${x.d}</b></span>
    <span class="txt"><b>${esc(x.title)}</b><span>${esc(x.stops.map(s => stopObj(s).short).join(" → "))}</span></span>
    <span class="meta">${icon("chev")}</span></button>`).join("")}</div>`;
}

function dayDetail(d) {
  const day = dayObj(d), now = vnNow(), isToday = today() === d;
  const plan = day.plan.map(p => ({ ...p, at: parseClock(p.time) }));
  const nextIdx = isToday ? plan.findIndex(p => p.at != null && p.at >= now.min - 10) : -1;
  const mine = D.cardList.filter(c => (c.days || []).includes(d) && day.stops.includes(c.stop));
  const factsToday = mine.filter(c => c.kind === "fact");
  const todo = mine.filter(c => ["do", "tailor"].includes(c.kind) && !c.backup);
  const ifRain = mine.filter(c => c.backup);
  const heads = mine.filter(c => c.kind === "hack");
  // Restaurants picked for today first, then other food for today, then the rest; warnings last.
  const eatRank = c => ((c.days || []).includes(d) ? 4 : 0) + (c.verdict ? 2 : 0) + (catOf(c) === "eat" ? 1 : 0) - (c.kind === "watch" ? 6 : 0);
  const eat = D.cardList.filter(c => day.stops.includes(c.stop) && (c.kind === "food" || c.kind === "watch"))
    .sort((a, b) => eatRank(b) - eatRank(a));
  const hotel = day.hotel && D.places[day.hotel];
  return `<button class="btn" style="width:auto;height:34px;margin-bottom:8px" data-act="back">${icon("back")} Trip</button>
    <div class="eyebrow">Day ${d} · ${esc(dateLabel(d))}</div>
    <h1 class="large-title">${esc(day.title)}</h1>
    <p class="vibe">Vibe: <b>${esc(day.vibe)}</b></p>
    <div class="badges" style="margin-top:10px"><span class="badge ok">Included: ${esc(day.meals || "no meals")}</span></div>
    <ol class="timeline">${plan.map((p, i) => `<li class="${isToday && nextIdx > i ? "past" : ""}${i === nextIdx ? " next" : ""}"><span class="t">${esc(p.time || "")}</span><span>${esc(p.text)}</span></li>`).join("")}</ol>
    ${hotel ? section("Sleep", `<div class="list"><button class="row" data-place="${esc(day.hotel)}"><span class="ic">${icon("home")}</span><span class="txt"><b>${esc(hotel.name)}</b><span>${esc(hotel.address_vi || "")}</span></span><span class="meta">${icon("chev")}</span></button></div>`) : ""}
    ${heads.length ? section("Heads up", rows(heads, { check: true })) : ""}
    ${todo.length ? section("Worth doing", rows(todo)) : ""}
    ${ifRain.length ? section("If it rains", rows(ifRain)) : ""}
    ${factsToday.length ? section("Unsolicited facts", rows(factsToday)) : ""}
    ${section("Eat", rows(eat.slice(0, 12)))}
    ${day.stops.map(s => `<button class="btn-tint" style="margin-top:12px" data-stop="${s}">Everything in ${esc(stopObj(s).short)} ${icon("chev")}</button>`).join("")}`;
}

function tripPlaces() {
  return `<div class="list" style="margin-top:12px">${D.stops.map(s => {
    const n = D.cardList.filter(c => c.stop === s.id).length;
    return `<button class="row" data-stop="${s.id}"><span class="ic">${icon("map")}</span><span class="txt"><b>${esc(s.name)}</b><span>${s.days.map(x => `${x} Nov`).join(", ")} · ${n} cards</span></span><span class="meta">${icon("chev")}</span></button>`;
  }).join("")}</div>`;
}

function stopDetail(id) {
  const s = stopObj(id);
  const cards = D.cardList.filter(c => c.stop === id);
  const groups = [["eat", "Eat"], ["coffee", "Coffee"], ["sweet", "Sweet"], ["drinks", "Drinks"], ["shop", "Shop"], ["pamper", "Pamper"], ["sights", "Sights"], ["vibes", "Vibes"], ["tailor", "Tailors"], ["practical", "Know this"], ["fact", "Unsolicited facts"]];
  const rainy = cards.filter(c => c.rainy);
  return `<button class="btn" style="width:auto;height:34px;margin-bottom:8px" data-act="back">${icon("back")} Trip</button>
    <div class="eyebrow">${s.days.map(x => `${x} Nov`).join(" · ")}</div><h1 class="large-title">${esc(s.name)}</h1>
    <button class="btn-tint" style="margin-top:12px" data-act="showmap" data-stop="${id}">${icon("map")} Open on the map</button>
    ${groups.map(([k, l]) => { const g = cards.filter(c => catOf(c) === k && !c.backup); return g.length ? section(l, rows(g)) : ""; }).join("")}
    ${rainy.length ? section("Rainy day", rows(rainy)) : ""}`;
}

function tripEat() {
  const dishes = D.dishes.map(id => D.cards[id]);
  const groups = { ok: "Easy yes", ask: "Ask first", avoid: "Pork, skip" };
  const shown = dishes.filter(c => (c.pork || "ask") === ui.trip.dish);
  const foodFacts = D.cardList.filter(c => c.kind === "fact" && c.stop === "whole");
  return `<button class="btn-primary" style="margin-top:12px" data-act="foodcard">${icon("card")} Show my food card</button>
    ${section("Say it in Vietnamese", `<div class="list">${D.phrases.map((p, i) => `<button class="phrase" data-phrase="${i}"><span class="en">${esc(p[0])}</span><span class="vi">${esc(p[1])}</span><span class="say">${esc(p[2])}</span></button>`).join("")}</div>`)}
    ${section("Dish guide", `<div class="seg">${Object.entries(groups).map(([k, l]) => `<button data-dish="${k}" aria-pressed="${ui.trip.dish === k}">${l}</button>`).join("")}</div>${rows(shown)}`)}
    ${foodFacts.length ? section("Food facts", rows(foodFacts)) : ""}`;
}

// ---- packing list: groups of tickable rows, ticks stored as pack.<group>.<n> ----
const packId = (g, i) => `pack.${g.id}.${i + 1}`;
function packProgress() {
  const ids = (D.packing || []).flatMap(g => g.items.map((_, i) => packId(g, i)));
  const n = ids.filter(id => done[id]).length;
  if (!n) return "Start with the easy wins: undies and socks.";
  return n === ids.length ? "All packed. Go on then." : `${n} of ${ids.length} packed`;
}
const packCount = g => { const n = g.items.filter((_, i) => done[packId(g, i)]).length; return n === g.items.length ? "Done" : `${n}/${g.items.length}`; };
function packCounts() {
  for (const g of D.packing || []) {
    const el = document.querySelector(`[data-packcount="${g.id}"]`);
    if (el) { el.textContent = packCount(g); el.classList.toggle("ok", el.textContent === "Done"); }
  }
  const total = document.querySelector("[data-packtotal]");
  if (total) total.textContent = packProgress();
}
function packing() {
  const groups = D.packing || [];
  let opened = false;
  const html = groups.map(g => {
    const count = packCount(g);
    const open = !opened && count !== "Done"; if (open) opened = true;
    // name="packing" makes the groups exclusive: opening one closes the rest, so it's never a wall.
    return `<details class="pack" name="packing"${open ? " open" : ""}><summary><span class="chev">${icon("chev")}</span><span>${esc(g.title)}</span><span class="meta${count === "Done" ? " ok" : ""}" data-packcount="${g.id}">${count}</span></summary>
      ${g.lead ? `<p class="sub pack-lead">${esc(g.lead)}</p>` : ""}
      <div class="list">${g.items.map(([text, note], i) => { const id = packId(g, i), on = !!done[id];
        return `<button type="button" class="row pack${on ? " done" : ""}" data-done="${id}"><span class="tick">${on ? icon("check") : ""}</span><span class="txt"><b>${esc(text)}</b>${note ? `<span>${esc(note)}</span>` : ""}</span></button>`; }).join("")}</div></details>`;
  }).join("");
  return `<div id="packing">${section("Packing", `<p class="sub" style="margin:0 4px 2px">Top to bottom, easiest first. One group at a time.</p><p class="foot" style="margin:0 4px 10px" data-packtotal>${esc(packProgress())}</p>${html}<p class="foot" style="margin:12px 4px 0">${esc(D.packingNote || "")}</p>`)}</div>`;
}

function tripPrep() {
  const todos = D.todos.map(id => D.cards[id]);
  const saved = store.get("mapsSaved");
  return `${section("Before you go", rows(todos, { check: true }))}
    ${packing()}
    ${section("Offline maps", `<div class="list" style="padding:14px;display:grid;gap:10px">
      <p class="sub">Download the map for every stop while you're on wifi, so it works on the train, the trek and the boat. About 40–80 MB.</p>
      <button class="btn-primary" data-act="savemaps" id="saveMapsBtn">${icon("download")} ${saved ? "Update offline maps" : "Download offline maps"}</button>
      <p class="foot" id="saveMapsMsg">${saved ? `Saved ${esc(saved)}.` : ""}</p></div>`)}
    ${section("Put it on your home screen", `<div class="list" style="padding:14px"><p class="sub">In Safari, tap Share, then Add to Home Screen. It opens full screen, like a real app, and works without signal.</p></div>`)}
    ${vibeReport(false)}
    <div class="btnrow" style="margin-top:18px"><button class="btn" data-act="resetfacts">Reset fact score</button><button class="btn" data-act="lock">${icon("lock")} Lock this phone</button></div>
    <p class="note">Build ${esc(D.build)}. Map data © OpenStreetMap contributors, tiles by OpenFreeMap.</p>`;
}

function vibeReport(big) {
  const tally = Object.values(facts), ok = tally.filter(v => v !== "boring").length, no = tally.length - ok;
  const deep = tally.filter(v => v === "deep").length;
  const ticks = Object.keys(done).filter(k => !k.startsWith("pack.")).length;
  const verdict = !tally.length ? "No facts rated yet. Suspicious." : ok > no ? "She's coming around." : ok === no ? "A dead heat." : "Tough crowd.";
  return `${big ? `<div class="eyebrow">After the trip</div><h1 class="large-title">Vibe report</h1>` : `<div class="section-h"><h2>Vibe report</h2></div>`}
    <div class="hero" style="margin-top:${big ? 16 : 0}px"><span class="k">Unsolicited facts</span>
      <span class="t">${ok} tolerated, ${no} boring</span>
      <span class="s">${deep} went all the way to “actually…”. ${esc(verdict)}</span>
      <span class="then">${ticks} heads-ups ticked off.</span></div>`;
}

async function saveMaps(btn) {
  const msg = $("#saveMapsMsg");
  btn.disabled = true;
  try {
    const r = await saveMapsOffline(D, (n, total, failed) => { msg.textContent = `Saving ${n} of ${total}${failed ? ` (${failed} failed)` : ""}…`; });
    const when = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    store.set("mapsSaved", when);
    msg.textContent = r.failed ? `Saved, but ${r.failed} pieces failed. Try again on better wifi.` : `Saved ${when}. Maps now work offline.`;
  } catch {
    msg.textContent = "Couldn't download the maps. Check the connection and try again.";
  } finally { btn.disabled = false; }
}

// ================= detail sheets =================
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; $(".modal-sheet").scrollTop = 0; }
function closeModal() { $("#modal").hidden = true; }

export function openCard(id) {
  const c = D.cards[id];
  if (!c) return;
  if (c.kind === "fact") return openFact(c);
  const p = placeOf(c), cat = CATS[catOf(c)] || CATS.practical;
  const kv = [["Order", c.order], ["Tip", c.tip], ["Reviews", c.reviews], ["When", c.when], ["Cost", c.price], ["Address", p?.address_vi]].filter(([, v]) => v);
  const dist = distTo(c);
  openModal(`<div class="detail">
    <div class="eyebrow" style="color:${cat.color}">${esc(cat.label)} · ${esc(stopObj(c.stop)?.short || "Anywhere")}${dist != null ? ` · ${distLabel(dist)}` : ""}</div>
    <h2 class="title2" id="modalTitle">${esc(c.title)}</h2>
    ${c.name_vi ? `<div class="vi">${esc(c.name_vi)}</div>` : ""}
    ${badgesHTML(c)}
    ${c.line ? `<p class="line">${esc(c.line)}</p>` : ""}
    ${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
    ${p && p.lat != null ? placeButtons(c.place, c.stop) : ""}
    ${c.kind === "food" || c.kind === "dish" ? `<button class="btn-tint" data-act="foodcard">${icon("card")} Show my food card</button>` : ""}
    ${notes(c)}
  </div>`);
}

function placeButtons(pid, stop) {
  const p = D.places[pid];
  return `<div class="btnrow"><a class="btn-primary" href="${directionsUrl(p)}" target="_blank" rel="noopener">${icon("nav")} Directions</a>
    <button class="btn" data-act="driver" data-pid="${esc(pid)}">${icon("car")} Show driver</button></div>
    <div class="btnrow"><button class="btn" data-act="showmap" data-pid="${esc(pid)}" data-stop="${esc(stop || "")}">${icon("map")} On the map</button>
    <a class="btn" href="${appleMapsUrl(p)}" target="_blank" rel="noopener">Apple Maps</a></div>
    ${p.confidence === "low" ? `<p class="foot">Pin is approximate: check the address with the driver.</p>` : ""}`;
}

function notes(c) {
  const n = (c.notes || []).filter(([, v]) => v);
  if (!n.length) return "";
  return `<details class="notes"><summary>Research notes</summary><dl>${n.map(([k, v]) => `${k ? `<dt>${esc(k)}</dt>` : ""}<dd>${md(v)}</dd>`).join("")}</dl></details>`;
}

function openFact(c) {
  const p = placeOf(c);
  openModal(`<div class="detail">
    <div class="eyebrow" style="color:var(--pink)">Unsolicited fact${c.myth ? " · myth-buster" : ""}</div>
    <h2 class="title2" id="modalTitle">${esc(c.hook)}</h2>
    <p class="line">${md(c.fact)}</p>
    ${c.actually ? `<details class="notes"><summary>Actually…</summary><p class="line" style="margin-top:8px">${md(c.actually)}</p></details>` : ""}
    ${c.deploy ? `<p class="foot">Use it: ${esc(c.deploy)}${c.confidence === "debated" ? " · sources disagree" : ""}</p>` : ""}
    ${p && p.lat != null ? placeButtons(c.place, c.stop) : ""}
  </div>`);
}

export function openPlace(pid) {
  const p = D.places[pid];
  if (!p) return;
  const cards = (p.cards || []).map(id => D.cards[id]).filter(Boolean);
  if (!p.home && cards.length === 1) return openCard(cards[0].id);
  openModal(`<div class="detail">
    <div class="eyebrow">${p.home ? "Your hotel" : "Here"}</div>
    <h2 class="title2" id="modalTitle">${esc(p.name)}</h2>
    ${p.address_vi ? `<dl class="kv"><div><dt>Address</dt><dd>${esc(p.address_vi)}</dd></div>${p.phone ? `<div><dt>Phone</dt><dd><a href="tel:${esc(p.phone.replace(/\s/g, ""))}">${esc(p.phone)}</a></dd></div>` : ""}</dl>` : ""}
    ${p.lat != null ? placeButtons(pid, p.stop) : ""}
    ${p.address_vi ? `<button class="btn" data-act="copy" data-text="${esc(p.address_vi)}">${icon("copy")} Copy address for Grab</button>` : ""}
    ${cards.length ? rows(cards) : ""}
  </div>`);
}

// ================= help =================
function tonightHotel() {
  const d = today();
  if (d >= 1 && d <= 14) return dayObj(d).hotel || (d > 1 ? dayObj(d - 1).hotel : null);
  return D.days[0].hotel;
}
function openHelp() {
  const pid = tonightHotel(), h = pid && D.places[pid];
  openModal(`<h2 class="title2" id="modalTitle">Help me</h2>
    <div class="tiles">
      <button class="tile hot" data-act="foodcard"><span class="ic">${icon("card")}</span><span><b>Show my food card</b><span>No pork, no grease, only a little milk</span></span></button>
      <button class="tile" data-act="home"><span class="ic">${icon("home")}</span><span><b>Take me home</b><span>${esc(h ? h.name : "Tonight's hotel")}</span></span></button>
      <button class="tile" data-act="phrases"><span class="ic">${icon("chat")}</span><span><b>Say it in Vietnamese</b><span>Big text to show people</span></span></button>
      <button class="tile" data-act="contact"><span class="ic">${icon("phone")}</span><span><b>Call our tour contact</b><span>${esc(D.help.contact.name)}</span></span></button>
      <button class="tile sos" data-act="unwell"><span class="ic">${icon("sos")}</span><span><b>I feel unwell</b><span>Red flags and the nearest clinic</span></span></button>
    </div>`);
}
function openPhrases() {
  openModal(`<h2 class="title2" id="modalTitle">Say it in Vietnamese</h2><p class="sub" style="margin:6px 0 12px">Tap one to show it full screen.</p>
    <div class="list">${D.phrases.map((p, i) => `<button class="phrase" data-phrase="${i}"><span class="en">${esc(p[0])}</span><span class="vi">${esc(p[1])}</span><span class="say">${esc(p[2])}</span></button>`).join("")}</div>`);
}
function openContact() {
  const c = D.help.contact;
  openModal(`<h2 class="title2" id="modalTitle">${esc(c.name)}</h2><p class="sub" style="margin:6px 0 12px">${esc(c.note)}</p>
    <div class="tiles">${c.phones.map(ph => `<a class="tile" href="tel:${esc(ph.replace(/\s/g, ""))}"><span class="ic">${icon("phone")}</span><span><b>${esc(ph)}</b><span>Call</span></span></a>`).join("")}
    ${c.whatsapp ? `<a class="tile" href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener"><span class="ic">${icon("chat")}</span><span><b>WhatsApp</b><span>Message the booking contact</span></span></a>` : ""}</div>
    <p class="note">Booking code: ${esc(c.booking)}</p>`);
}
function openUnwell() {
  const s = currentStop(), H = D.help;
  const clinics = H.clinics.filter(c => c.stops.includes(s)).concat(H.clinics.filter(c => !c.stops.includes(s)));
  openModal(`<h2 class="title2" id="modalTitle">I feel unwell</h2>
    <div class="list" style="padding:14px;margin-top:12px;display:grid;gap:8px"><b style="color:var(--red)">See a doctor now if:</b>${H.redflags.map(r => `<span class="sub">• ${esc(r)}</span>`).join("")}</div>
    ${section("Self-care", `<div class="list" style="padding:14px;display:grid;gap:6px">${H.selfcare.map(r => `<span class="sub">• ${esc(r)}</span>`).join("")}</div>`)}
    ${section("Clinics", `<div class="list">${clinics.map(c => `<div class="row" style="grid-template-columns:36px 1fr"><span class="ic" style="background:var(--red-tint);color:var(--red)">${icon("sos")}</span>
      <span class="txt"><b>${esc(c.name)}</b><span>${esc(c.city)}${c.address ? ` · ${esc(c.address)}` : ""}</span>
      <span style="display:flex;gap:14px;margin-top:4px">${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a>` : ""}${c.lat ? `<a href="${directionsUrl(c)}" target="_blank" rel="noopener">Directions</a>` : ""}</span></span></div>`).join("")}</div>`)}
    <p class="note">${esc(H.insurance)}</p>`);
}

// ================= posters: full-screen text for staff and drivers =================
function poster(kind, arg) {
  const el = $("#poster");
  let html = "";
  if (kind === "food") {
    const f = D.dietary;
    html = `<h2>${esc(f.heading)}</h2>${f.lines.map(l => `<p>${md(l)}</p>`).join("")}<p class="en">${esc(f.english)}</p>`;
  } else if (kind === "driver") {
    const p = D.places[arg];
    html = `<h2>Xin chở tôi đến:</h2><p class="big">${esc(p.name_vi || p.name)}</p><p>${esc(p.address_vi || "")}</p><p class="en">Please take me to ${esc(p.name)}. Thank you!</p>`;
  } else if (kind === "phrase") {
    const ph = D.phrases[arg];
    html = `<p class="big">${esc(ph[1])}</p><p class="en">${esc(ph[0])} · ${esc(ph[2])}</p>`;
  }
  el.innerHTML = `<button class="done-top" data-act="closeposter">Done</button>` + html;
  el.hidden = false;
  try { navigator.wakeLock?.request("screen").then(l => { el._lock = l; }).catch(() => {}); } catch { /* optional */ }
}
function closePoster() { const el = $("#poster"); el.hidden = true; el._lock?.release?.(); }

// ================= small things =================
function toast(msg, action) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  t.hidden = false;
  if (action) t.querySelector("button").onclick = action.run;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, action ? 15000 : 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Address copied. Paste it into Grab."); }
  catch { toast("Couldn't copy. Show the driver instead."); }
}

// ================= service worker: offline + "new vibes" updates =================
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    const prompt = w => toast("New vibes available.", { label: "Refresh", run: () => w.postMessage("skip") });
    if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) prompt(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60e3);
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
