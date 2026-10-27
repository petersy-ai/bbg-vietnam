// Map tab: MapLibre with OpenFreeMap tiles, category pins, a draggable bottom sheet.
/* global maplibregl */
import { $, esc, icon, CATS, catOf, metres, distLabel, store } from "./util.js";

const FILTERS = ["all", "eat", "coffee", "sweet", "shop", "sights", "rainy", "vibes", "tailor", "fact"];
const dark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const STYLE = () => `https://tiles.openfreemap.org/styles/${dark() ? "dark" : "positron"}`;

let ctx, map, markers = [], filter = "all", stopId = null, userPos = null, built = false;

export function initMap(context) { ctx = context; }

export function showMap({ stop, place } = {}) {
  stopId = stop || stopId || ctx.currentStop();
  if (!built) build();
  else map.resize();
  renderChips();
  renderSheet();
  if (place) focusPlace(place);
  else flyToStop(stopId, !built);
}

function build() {
  built = true;
  const s = ctx.D.stops.find(x => x.id === stopId) || ctx.D.stops[0];
  map = new maplibregl.Map({
    container: "map", style: STYLE(), center: s.center, zoom: s.zoom,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: false });
  map.addControl(geo, "top-right");
  geo.on("geolocate", e => { userPos = [e.coords.longitude, e.coords.latitude]; ctx.setPos(userPos); renderSheet(); });
  map.on("style.load", tint);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => map.setStyle(STYLE()));
  addPins();
  wireSheet();
}

// Nudge the neutral basemap toward the brand: lavender water in light mode.
function tint() {
  try {
    if (!dark() && map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#e6dcf2");
    if (dark() && map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#2a1f36");
  } catch { /* style differences are cosmetic */ }
}

// ---------- pins ----------
function pinCards(placeId) { return (ctx.D.places[placeId]?.cards || []).map(id => ctx.D.cards[id]).filter(Boolean); }

function visibleFor(card) {
  if (filter === "all") return card.kind !== "fact" && !card.backup;
  if (filter === "vibes") return !!card.vibes;
  if (filter === "rainy") return !!card.rainy;
  return catOf(card) === filter;
}

function addPins() {
  for (const [pid, p] of Object.entries(ctx.D.places)) {
    if (p.lat == null) continue;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "pin" + (p.home ? " home" : "");
    el.addEventListener("click", ev => { ev.stopPropagation(); openPlace(pid); });
    const m = new maplibregl.Marker({ element: el, anchor: "bottom-left", offset: [-4, 4] }).setLngLat([p.lng, p.lat]).addTo(map);
    el.setAttribute("aria-label", p.name); // after the Marker, which overwrites it with "Map marker"
    markers.push({ pid, el, m });
  }
  paintPins();
}

function paintPins() {
  for (const { pid, el } of markers) {
    const p = ctx.D.places[pid];
    if (p.home) { el.innerHTML = `<span>${icon("home")}</span>`; el.hidden = false; styleIcon(el); continue; }
    const cards = pinCards(pid).filter(visibleFor);
    el.hidden = !cards.length;
    if (!cards.length) continue;
    const cat = filter !== "all" && filter !== "vibes" ? filter : catOf(cards[0]);
    el.style.background = (filter === "vibes" ? CATS.vibes : CATS[cat] || CATS.practical).color;
    el.innerHTML = `<span>${icon(filter === "vibes" ? "vibes" : (CATS[cat] || CATS.practical).icon)}</span>`;
    styleIcon(el);
  }
}
function styleIcon(el) { const s = el.querySelector("svg"); if (s) { s.style.width = "15px"; s.style.height = "15px"; s.style.stroke = "#fff"; s.style.strokeWidth = "2.2"; } }

function openPlace(pid) {
  const cards = pinCards(pid).filter(c => ctx.D.places[pid].home || visibleFor(c));
  map.easeTo({ center: [ctx.D.places[pid].lng, ctx.D.places[pid].lat], duration: 400, offset: [0, -120] });
  markers.forEach(x => x.el.classList.toggle("sel", x.pid === pid));
  if (ctx.D.places[pid].home || cards.length !== 1) ctx.openPlace(pid);
  else ctx.openCard(cards[0].id);
}

export function focusPlace(pid) {
  const p = ctx.D.places[pid];
  if (!p || p.lat == null) return;
  map.jumpTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15.5) });
  markers.forEach(x => x.el.classList.toggle("sel", x.pid === pid));
  const card = pinCards(pid)[0];
  if (card && !visibleFor(card)) { filter = "all"; renderChips(); paintPins(); }
  setDetent("peek");
}

function flyToStop(id, instant) {
  const s = ctx.D.stops.find(x => x.id === id);
  if (!s) return;
  map[instant ? "jumpTo" : "flyTo"]({ center: s.center, zoom: s.zoom, ...(instant ? {} : { duration: 900 }) });
}

// ---------- chips ----------
function renderChips() {
  $("#mapChips").innerHTML = FILTERS.map(f => {
    const c = f === "all" ? { label: "Everything", color: "" } : CATS[f];
    return `<button type="button" class="chip" data-filter="${f}" aria-pressed="${filter === f}">${c.color ? `<i style="background:${c.color}"></i>` : ""}${esc(c.label)}</button>`;
  }).join("");
}
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-filter]");
  if (chip) { filter = chip.dataset.filter; store.set("mapFilter", filter); renderChips(); paintPins(); renderSheet(); return; }
  const sp = e.target.closest("[data-mapstop]");
  if (sp) { stopId = sp.dataset.mapstop; renderSheet(); flyToStop(stopId); return; }
  const row = e.target.closest("[data-maprow]");
  if (row) { const id = row.dataset.maprow, c = ctx.D.cards[id]; if (c.place) focusPlace(c.place); ctx.openCard(id); }
});

// ---------- sheet ----------
function refPoint(stop) {
  if (userPos && metres(userPos, stop.center) < 30000) return { pt: userPos, label: "" };
  const home = stop.hotel && ctx.D.places[stop.hotel];
  return home ? { pt: [home.lng, home.lat], label: " from hotel" } : { pt: stop.center, label: "" };
}

function renderSheet() {
  const stop = ctx.D.stops.find(s => s.id === stopId) || ctx.D.stops[0];
  const ref = refPoint(stop);
  const items = Object.values(ctx.D.cards)
    .filter(c => c.stop === stop.id && c.place && ctx.D.places[c.place]?.lat != null && visibleFor(c))
    .map(c => { const p = ctx.D.places[c.place]; return { c, d: metres(ref.pt, [p.lng, p.lat]) }; })
    .sort((a, b) => a.d - b.d);
  const label = filter === "all" ? "places" : filter === "rainy" ? "rainy-day options" : (CATS[filter]?.label || "").toLowerCase();
  $("#sheetBody").innerHTML = `
    <div class="sheet-head"><h2>${esc(stop.name)}</h2><span class="foot">${items.length} ${esc(label)}</span></div>
    <div class="stop-pick">${ctx.D.stops.map(s => `<button type="button" data-mapstop="${s.id}" aria-pressed="${s.id === stop.id}">${esc(s.short || s.name)}</button>`).join("")}</div>
    ${items.length ? `<div class="list">${items.map(({ c, d }) => {
      const cat = CATS[catOf(c)] || CATS.practical;
      return `<button type="button" class="row" data-maprow="${esc(c.id)}">
        <span class="ic" style="background:${cat.color}22;color:${cat.color}">${icon(cat.icon)}</span>
        <span class="txt"><b>${esc(c.title)}</b><span>${esc(c.kind === "fact" ? c.hook : c.line || "")}</span></span>
        <span class="meta">${distLabel(d)}${ref.label ? "" : ""}</span></button>`;
    }).join("")}</div>${ref.label ? `<p class="note">Distances are${esc(ref.label)}. Tap the arrow button on the map to use your location.</p>` : ""}`
      : `<p class="empty">Nothing in this category here. Try another chip, or another stop.</p>`}`;
}

function wireSheet() {
  const sheet = $("#sheet"), grab = $("#sheetGrab");
  let startY = 0, startT = 0, dragging = false;
  const detentY = d => { const h = sheet.getBoundingClientRect().height; return { peek: h - 150, half: h - innerHeight * 0.45, full: 0 }[d]; };
  const begin = y => { dragging = true; startY = y; startT = detentY(sheet.dataset.detent); sheet.classList.add("dragging"); };
  const move = y => { if (!dragging) return; const t = Math.max(0, startT + (y - startY)); sheet.style.transform = `translateY(${t}px)`; };
  const end = y => {
    if (!dragging) return; dragging = false; sheet.classList.remove("dragging"); sheet.style.transform = "";
    const t = startT + (y - startY), dets = ["full", "half", "peek"];
    const best = dets.reduce((a, b) => Math.abs(detentY(a) - t) < Math.abs(detentY(b) - t) ? a : b);
    setDetent(Math.abs(y - startY) < 6 ? cycle(sheet.dataset.detent) : best);
  };
  const cycle = d => ({ peek: "half", half: "full", full: "peek" }[d]);
  grab.addEventListener("pointerdown", e => { begin(e.clientY); grab.setPointerCapture(e.pointerId); });
  grab.addEventListener("pointermove", e => move(e.clientY));
  grab.addEventListener("pointerup", e => end(e.clientY));
  grab.addEventListener("pointercancel", e => end(e.clientY));
  // The header is re-rendered, so delegate drags from it too.
  $("#sheetBody").addEventListener("pointerdown", e => {
    const head = e.target.closest(".sheet-head");
    if (!head) return;
    begin(e.clientY);
    const mv = ev => move(ev.clientY), up = ev => { end(ev.clientY); removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
  map.on("click", () => setDetent("peek"));
}
function setDetent(d) { $("#sheet").dataset.detent = d; }

// ---------- offline map packs ----------
// Fetches every tile, glyph range and sprite needed for each stop at zooms 12-16.
// The service worker stores them, so the map keeps working without signal.
export async function saveMapsOffline(D, onProgress) {
  const styles = [];
  for (const name of ["positron", "dark"]) styles.push(await (await fetch(`https://tiles.openfreemap.org/styles/${name}`)).json());
  const style = styles[0];
  const srcUrl = style.sources.openmaptiles.url;
  const tilejson = await (await fetch(srcUrl)).json();
  const tmpl = tilejson.tiles[0];
  const urls = new Set();
  const tile = (lng, lat, z) => {
    const n = 2 ** z, x = Math.floor((lng + 180) / 360 * n);
    const r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return [x, y];
  };
  for (const s of D.stops) {
    const [w, so, e, n] = s.bbox;
    for (let z = 11; z <= 16; z++) {
      const [x0, y0] = tile(w, n, z), [x1, y1] = tile(e, so, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.add(tmpl.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
  }
  for (const st of styles) {
    const fonts = new Set();
    for (const l of st.layers) { const f = l.layout?.["text-font"]; if (Array.isArray(f)) fonts.add(f.join(",")); }
    for (const f of fonts) for (const r of ["0-255", "256-511", "512-767", "768-1023", "7680-7935", "8192-8447"]) {
      urls.add(st.glyphs.replace("{fontstack}", encodeURIComponent(f)).replace("{range}", r));
    }
    const sprites = Array.isArray(st.sprite) ? st.sprite.map(s => s.url) : [st.sprite];
    for (const sp of sprites) for (const ext of [".json", ".png", "@2x.json", "@2x.png"]) urls.add(sp + ext);
  }
  const list = [...urls];
  let done = 0, failed = 0;
  const worker = async () => {
    while (list.length) {
      const u = list.pop();
      try { const r = await fetch(u); if (!r.ok) failed++; } catch { failed++; }
      done++; if (done % 20 === 0 || !list.length) onProgress(done, urls.size, failed);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: urls.size, failed };
}
