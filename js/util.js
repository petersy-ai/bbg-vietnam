// Small shared helpers: escaping, Vietnam time, distances, icons, local storage.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Minimal inline formatting for research text: **bold**, *italic*, line breaks.
export const md = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
  .replace(/\n/g, "<br>");

export const $ = (sel, root = document) => root.querySelector(sel);

const LS = "bbg-";
export const store = {
  get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch { /* private mode or full */ } },
  del(k) { try { localStorage.removeItem(LS + k); } catch { /* ignore */ } },
};

// ---- time: everything runs on Vietnam time (UTC+7, no daylight saving) ----
const TRIP_YEAR = 2026, TRIP_MONTH = 10; // November (0-based)

// ?at=2026-11-06T11:30 lets you preview the app as it will look at that moment.
function overrideNow() {
  const at = new URLSearchParams(location.search).get("at");
  if (!at) return null;
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0)) - 7 * 3600e3;
}

export function vnNow() {
  const ms = overrideNow() ?? Date.now();
  const t = new Date(ms + 7 * 3600e3);
  return { ms, y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

// 0 = before the trip, 1..14 = trip day, 15 = after.
export function tripDay(now = vnNow()) {
  if (now.y < TRIP_YEAR || (now.y === TRIP_YEAR && now.m < TRIP_MONTH)) return 0;
  if (now.y > TRIP_YEAR || now.m > TRIP_MONTH || now.d > 14) return 15;
  return now.d;
}

export function daysUntilTrip(now = vnNow()) {
  const start = Date.UTC(TRIP_YEAR, TRIP_MONTH, 1) - 7 * 3600e3;
  const midnight = Date.UTC(now.y, now.m, now.d) - 7 * 3600e3;
  return Math.round((start - midnight) / 86400e3);
}

export function period(min) {
  if (min < 11 * 60) return "morning";
  if (min < 14 * 60) return "midday";
  if (min < 17 * 60) return "afternoon";
  if (min < 21 * 60) return "evening";
  return "night";
}

export function parseClock(s) {
  const m = String(s || "").match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

export function inWords(mins) {
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

// ---- distance ----
export function metres(a, b) {
  const R = 6371e3, toR = x => x * Math.PI / 180;
  const dLat = toR(b[1] - a[1]), dLng = toR(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[1])) * Math.cos(toR(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function distLabel(m) {
  if (m == null) return "";
  if (m < 950) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  if (m < 20000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}

// ---- links ----
export const directionsUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
export const appleMapsUrl = p => `https://maps.apple.com/?daddr=${p.lat},${p.lng}`;

// ---- categories: label, pin colour, icon ----
const I = {
  eat: '<path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-1.5 1.5-1.5 1.5-3M14 7c0-1.5 1.5-1.5 1.5-3"/>',
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 4v2M11 3v3"/>',
  sweet: '<path d="M8 10a4 4 0 1 1 8 0M7 10h10l-5 11-5-11z"/>',
  shop: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
  sights: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>',
  vibes: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
  tailor: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.5 16 18 4M15.5 16 6 4"/>',
  practical: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  fact: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.6.4-1 1.1-1 1.8V16h-5v-.3c0-.7-.4-1.4-1-1.8A6 6 0 0 1 12 3z"/>',
  home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  watch: '<path d="M12 4 2.5 20h19L12 4zM12 10v4.5M12 17.5v.5"/>',
  dish: '<path d="M3 13h18M5 13a7 7 0 0 0 14 0M12 6v2"/>',
  check: '<path d="M5 12.5 10 17 19 7.5"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  nav: '<path d="M3 11 21 3l-8 18-2-8-8-2z"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M3.5 11h17"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 10h10M7 14h6"/>',
  sos: '<path d="M12 4v16M4 12h16"/>',
  map: '<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4zM9 4v14M15 6v14"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
export const icon = (name, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${I[name] || I.practical}</svg>`;

export const CATS = {
  eat: { label: "Eat", color: "#AF52DE", icon: "eat" },
  coffee: { label: "Coffee", color: "#A2845E", icon: "coffee" },
  sweet: { label: "Sweet", color: "#FF2D55", icon: "sweet" },
  shop: { label: "Shop", color: "#FF9500", icon: "shop" },
  sights: { label: "Sights", color: "#007AFF", icon: "sights" },
  vibes: { label: "Vibes", color: "#5856D6", icon: "vibes" },
  tailor: { label: "Tailors", color: "#30B0C7", icon: "tailor" },
  fact: { label: "Facts", color: "#D83A7C", icon: "fact" },
  practical: { label: "Know this", color: "#8E8E93", icon: "practical" },
};

export function catOf(card) {
  if (card.kind === "fact") return "fact";
  if (card.kind === "watch") return "practical";
  return CATS[card.filter] ? card.filter : ({ food: "eat", do: "sights", tailor: "tailor", hack: "practical", dish: "eat" }[card.kind] || "practical");
}

// Pork / dairy / grease / effort chips.
export function badgesHTML(c, { effort = true } = {}) {
  const out = [];
  const pork = { ok: ["ok", "Pork-free"], ask: ["mid", "Ask: pork?"], avoid: ["bad", "Has pork"] }[c.pork];
  if (pork) out.push(`<span class="badge ${pork[0]}">${pork[1]}</span>`);
  const dairy = { none: ["ok", "No dairy"], low: ["ok", "Little dairy"], some: ["mid", "Some dairy"], high: ["bad", "Lots of dairy"] }[c.dairy];
  if (dairy) out.push(`<span class="badge ${dairy[0]}">${dairy[1]}</span>`);
  const grease = { light: ["ok", "Light"], medium: ["mid", "Bit oily"], heavy: ["bad", "Greasy"] }[c.grease];
  if (grease) out.push(`<span class="badge ${grease[0]}">${grease[1]}</span>`);
  if (effort) {
    const ef = { easy: ["ok", "Easy"], moderate: ["mid", "Some effort"], hard: ["bad", "Hard work"] }[c.effort];
    if (ef) out.push(`<span class="badge ${ef[0]}">${ef[1]}</span>`);
  }
  if (c.vibes) out.push(`<span class="badge vibe">Vibes</span>`);
  return out.length ? `<div class="badges">${out.join("")}</div>` : "";
}
