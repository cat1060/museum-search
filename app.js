// Browser side: reads the form, asks /api/search for each selected museum in parallel,
// and interleaves the results into one grid as each museum answers.
// Images load with referrerpolicy="no-referrer": the Art Institute of Chicago's image
// server refuses requests that carry another site's address as the referrer.

const SOURCES = [
  { id: "aic", name: "Art Institute of Chicago" },
  { id: "cma", name: "Cleveland Museum of Art" },
  { id: "met", name: "The Metropolitan Museum of Art" },
  { id: "rijks", name: "Rijksmuseum" },
  { id: "ham", name: "Harvard Art Museums" },
];
const sourceName = Object.fromEntries(SOURCES.map((s) => [s.id, s.name]));
const FILTER_FIELDS = ["artist", "type", "dateFrom", "dateTo", "place", "material"];

const $ = (sel) => document.querySelector(sel);
const form = $("#search-form");
const grid = $("#results");

const state = {
  run: 0,             // increases on every new search, so stale responses are ignored
  query: null,        // the filters for the current search
  sources: [],        // museums in the current search
  page: 0,
  pages: [],          // pages[n][sourceId] = results
  info: {},           // info[sourceId] = latest response (total, notes, error…)
  hidden: new Set(),  // museums the viewer has toggled off
  cards: new Map(),   // "source:id" → card element
};

// ---------- Collections dropdown ----------
const menu = $("#collections-menu");
const menuButton = $("#collections-button");
const boxes = () => [...menu.querySelectorAll('input[name="sources"]')];

function setMenuOpen(open) {
  menu.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  if (open) boxes()[0].focus();
}
function updateCollectionsLabel() {
  const on = boxes().filter((b) => b.checked);
  $("#collections-label").textContent =
    on.length === SOURCES.length ? `All ${SOURCES.length} collections` :
    on.length === 1 ? sourceName[on[0].value] :
    `${on.length} collections`;
}
menuButton.addEventListener("click", () => setMenuOpen(menu.hidden));
$("#menu-done").addEventListener("click", () => { setMenuOpen(false); menuButton.focus(); });
$("#select-all").addEventListener("click", () => { boxes().forEach((b) => (b.checked = true)); updateCollectionsLabel(); });
menu.addEventListener("change", (e) => {
  // Keep at least one museum selected.
  if (!boxes().some((b) => b.checked)) e.target.checked = true;
  updateCollectionsLabel();
});
document.addEventListener("click", (e) => {
  if (!menu.hidden && !e.target.closest(".collections")) setMenuOpen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menu.hidden) { setMenuOpen(false); menuButton.focus(); }
});

// ---------- Form <-> query ----------
function readForm() {
  const q = { q: $("#q").value.trim() };
  for (const f of FILTER_FIELDS) q[f] = $(`#${f}`).value.trim();
  q.onView = $("#onView").checked ? "1" : "";
  q.openAccess = $("#openAccess").checked ? "1" : "0";
  return q;
}
function writeForm(q) {
  $("#q").value = q.q ?? "";
  for (const f of FILTER_FIELDS) $(`#${f}`).value = q[f] ?? "";
  $("#onView").checked = q.onView === "1";
  $("#openAccess").checked = q.openAccess !== "0";
  updateFilterCount();
}
function updateFilterCount() {
  const q = readForm();
  const n = FILTER_FIELDS.filter((f) => q[f]).length + (q.onView ? 1 : 0) + (q.openAccess === "0" ? 1 : 0);
  const badge = $("#filter-count");
  badge.hidden = n === 0;
  badge.textContent = n;
}
$("#filters").addEventListener("input", updateFilterCount);
$("#clear-filters").addEventListener("click", () => {
  writeForm({ q: $("#q").value });
});

// Keep the search in the address bar so it can be bookmarked or shared.
function saveToUrl(q, sources) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v && !(k === "openAccess" && v === "1")) params.set(k, v);
  if (sources.length < SOURCES.length) params.set("sources", sources.join(","));
  history.replaceState(null, "", params.toString() ? `?${params}` : location.pathname);
}
function loadFromUrl() {
  const params = new URLSearchParams(location.search);
  if (![...params.keys()].length) return false;
  const q = Object.fromEntries(params);
  writeForm(q);
  if (q.sources) {
    const wanted = q.sources.split(",");
    boxes().forEach((b) => (b.checked = wanted.includes(b.value)));
    if (!boxes().some((b) => b.checked)) boxes().forEach((b) => (b.checked = true));
  }
  updateCollectionsLabel();
  if (FILTER_FIELDS.some((f) => q[f]) || q.onView || q.openAccess === "0") $("#filters").open = true;
  return true;
}

// ---------- Searching ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  setMenuOpen(false);
  startSearch();
});
$("#load-more").addEventListener("click", () => fetchPage());

function startSearch() {
  state.run++;
  state.query = readForm();
  state.sources = boxes().filter((b) => b.checked).map((b) => b.value);
  state.page = 0;
  state.pages = [];
  state.info = {};
  state.cards.clear();
  grid.replaceChildren();
  $("#welcome").hidden = true;
  $("#status").hidden = false;
  saveToUrl(state.query, state.sources);
  fetchPage();
}

async function fetchPage() {
  const run = state.run;
  const page = ++state.page;
  const sources = state.sources.filter((id) => page === 1 || state.info[id]?.hasMore);
  state.pages[page] = {};
  for (const id of sources) state.info[id] = { ...state.info[id], loading: true };
  renderStatus();
  $("#load-more").disabled = true;

  await Promise.all(sources.map(async (id) => {
    const params = new URLSearchParams({ ...state.query, source: id, page: String(page) });
    let data;
    try {
      const res = await fetch(`/api/search?${params}`);
      data = await res.json();
    } catch {
      data = { error: `Couldn't reach ${sourceName[id]}.` };
    }
    if (run !== state.run) return; // a newer search has started
    state.pages[page][id] = data.results ?? [];
    state.info[id] = { ...state.info[id], ...data, loading: false, shown: (state.info[id]?.shown ?? 0) + (data.results?.length ?? 0) };
    if (data.error) state.info[id].hasMore = false;
    renderResults();
    renderStatus();
  }));

  if (run !== state.run) return;
  $("#load-more").disabled = false;
}

// ---------- Rendering ----------
function renderStatus() {
  const chips = state.sources.map((id) => {
    const info = state.info[id] ?? {};
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (info.loading ? " loading" : "") + (info.error ? " error" : "");
    chip.dataset.source = id;
    chip.setAttribute("aria-pressed", String(!state.hidden.has(id)));
    chip.title = state.hidden.has(id) ? "Show this museum's results" : "Hide this museum's results";
    const count =
      info.error ? "Unavailable" :
      info.total == null ? "Searching" :
      `${info.total.toLocaleString()} ${info.total === 1 ? "match" : "matches"}`;
    chip.innerHTML = `<span class="dot" data-source="${id}"></span><span>${sourceName[id]}</span><span class="n">${count}</span>`;
    chip.addEventListener("click", () => {
      state.hidden.has(id) ? state.hidden.delete(id) : state.hidden.add(id);
      renderResults();
      renderStatus();
    });
    return chip;
  });
  $("#source-chips").replaceChildren(...chips);

  const notes = state.sources.map((id) => {
    const info = state.info[id] ?? {};
    const box = document.createElement("div");
    box.className = "museum-notes";
    box.dataset.source = id;
    const items = info.error
      ? `<li class="ignored">${escapeHtml(info.error)}</li>`
      : (info.notes ?? []).map((n) => `<li class="${n.level}">${escapeHtml(n.text)}</li>`).join("") ||
        (info.loading ? "<li>Searching…</li>" : `<li class="applied">No filters: plain search</li>`);
    const upstream = (info.upstream ?? []).map((u) =>
      u.startsWith("http") && !u.includes("{") ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a>` : escapeHtml(u)
    ).join("<br>");
    box.innerHTML = `<h3>${sourceName[id]}</h3><ul>${items}</ul>${upstream ? `<div class="upstream">${upstream}</div>` : ""}`;
    return box;
  });
  $("#translation-body").replaceChildren(...notes);

  const anyLoading = state.sources.some((id) => state.info[id]?.loading);
  const anyMore = state.sources.some((id) => state.info[id]?.hasMore);
  $("#load-more").hidden = !anyMore && !anyLoading || state.page === 0;
  $("#load-more").textContent = anyLoading ? "Loading…" : "Load more";
  const shown = grid.querySelectorAll(".card:not([hidden])").length;
  $("#empty").hidden = anyLoading || shown > 0;
}

// Interleave each page's results across museums: one from each in turn.
function renderResults() {
  const ordered = [];
  for (const page of state.pages) {
    if (!page) continue;
    const lists = state.sources.map((id) => page[id] ?? []);
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) for (const l of lists) if (l[i]) ordered.push(l[i]);
  }
  const els = ordered.map((item) => {
    const key = `${item.source}:${item.id}`;
    let el = state.cards.get(key);
    if (!el) {
      el = makeCard(item);
      state.cards.set(key, el);
    }
    el.hidden = state.hidden.has(item.source);
    return el;
  });
  grid.replaceChildren(...els);
}

function makeCard(item) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.source = item.source;
  const who = [item.artist, item.date].filter(Boolean).join(", ");
  card.innerHTML = `
    <div class="frame">${item.image ? `<img loading="lazy" alt="" referrerpolicy="no-referrer" src="${escapeHtml(item.image)}">` : "No image"}</div>
    <div class="label">
      <span class="title">${escapeHtml(item.title)}</span>
      <span class="who">${escapeHtml(who)}</span>
      <span class="where"><span class="dot" data-source="${item.source}"></span>${sourceName[item.source]}</span>
    </div>`;
  card.setAttribute("aria-label", `${item.title}${who ? `, ${who}` : ""}, ${sourceName[item.source]}`);
  const img = card.querySelector("img");
  if (img) img.addEventListener("error", () => img.replaceWith("Image unavailable"));
  card.addEventListener("click", () => openDetail(item));
  return card;
}

// ---------- Detail dialog ----------
const dialog = $("#detail");
function openDetail(item) {
  dialog.dataset.source = item.source;
  $("#detail-source").textContent = sourceName[item.source];
  $("#detail-title").textContent = item.title;
  $("#detail-artist").textContent = item.artist;
  const img = $("#detail-image");
  img.src = item.imageLarge || item.image || "";
  img.alt = item.title;
  const facts = [
    ["Date", item.date], ["Type", item.type], ["Medium", item.medium], ["Place", item.place], ["Licence", item.license],
  ].filter(([, v]) => v);
  $("#detail-facts").innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  $("#detail-link").href = item.url;
  dialog.showModal();
}
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

// ---------- Suggestions ----------
document.querySelectorAll(".suggestions button").forEach((b) => {
  b.addEventListener("click", () => {
    const d = b.dataset;
    writeForm({ q: d.q, artist: d.artist, type: d.type, dateFrom: d.from, dateTo: d.to, place: d.place, onView: d.onview });
    if (d.artist || d.type || d.from || d.place || d.onview) $("#filters").open = true;
    startSearch();
  });
});

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Start ----------
updateCollectionsLabel();
updateFilterCount();
if (loadFromUrl()) startSearch();
