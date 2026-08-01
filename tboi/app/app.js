const DATA_FILES = {
  items: "../data/items.json",
  trinkets: "../data/trinkets.json",
  cards: "../data/cards-runes.json",
  pills: "../data/pills.json",
  characters: "../data/characters.json",
};
const SYNERGIES_FILE = "../data/synergies.json";
const ROUTES_FILE = "../data/routes.json";
const MARKS_FILE = "../data/marks.json";
const MARKS_PROGRESS_KEY = "tboi_marks_progress_v1";
const STARTING_ITEMS_FILE = "../data/starting-items.json";
const BUILD_KEY = "tboi_build_v1";
const CHALLENGES_FILE = "../data/challenges.json";

const CATEGORY_LABELS = {
  all: "Todo",
  items: "Items",
  trinkets: "Trinkets",
  cards: "Cartas",
  pills: "Pills",
  characters: "Personajes",
  routes: "Rutas",
  marks: "Marcas",
  build: "Build",
  challenges: "Desafíos",
};

let DATA = { items: [], trinkets: [], cards: [], pills: [], characters: [] };
let SYNERGIES = [];
let ROUTES = [];
let MARKS = [];
let marksProgress = {}; // "PJ01:M01" -> true
let STARTING_ITEMS = [];
let build = { characterCode: null, itemCodes: [] }; // itemCodes are "items:C001" style keys
let CHALLENGES = [];
let synergyIndex = new Map(); // code -> [synergy,...]

let state = {
  query: "",
  category: "all",
  quality: new Set(), // empty = all qualities; otherwise set of selected 0-4
  view: "list", // "list" | "grid"
  sort: "id", // "id" | "color" | "name"
  selectedCode: null, // "category:code" shown in the detail panel (grid mode)
  expandedCharCode: null, // which character's mark checklist is open (marks view)
  lastDraw: null, // { charCode, markCode } from the last "sortear" roll
};

const COLOR_WORDS = [
  "red", "blue", "green", "yellow", "purple", "pink", "orange",
  "black", "white", "grey", "gray", "brown", "gold", "cyan",
];

function getColor(entry) {
  const tags = (entry.raw && entry.raw.tags) || [];
  const found = tags.find((t) => COLOR_WORDS.includes(t.toLowerCase()));
  return found ? found.toLowerCase() : "zzz-sin color";
}

function normalizeText(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function buildSynergyIndex() {
  synergyIndex = new Map();
  for (const s of SYNERGIES) {
    if (!synergyIndex.has(s.item_a_code)) synergyIndex.set(s.item_a_code, []);
    if (!synergyIndex.has(s.item_b_code)) synergyIndex.set(s.item_b_code, []);
    synergyIndex.get(s.item_a_code).push(s);
    if (s.item_a_code !== s.item_b_code) synergyIndex.get(s.item_b_code).push(s);
  }
}

// Normalizes an entry from any category into a common shape for rendering.
function normalizeEntry(category, raw) {
  const base = {
    category,
    code: raw.code,
    name: raw.name,
    raw,
    icon: raw.icon ? `../data/${raw.icon}` : null,
  };

  if (category === "items" || category === "trinkets") {
    return {
      ...base,
      subtitle: raw.quote || "",
      quality: raw.quality,
      searchable: [raw.name, raw.quote, raw.description, raw.dlc, raw.pool, ...(raw.tags || [])],
      badges: [raw.dlc, raw.pool].filter(Boolean),
      detail: [
        raw.description ? { label: "Descripción", value: raw.description } : null,
        raw.type ? { label: "Tipo", value: raw.type } : null,
        raw.pool ? { label: "Item Pool", value: raw.pool } : null,
        raw.tags && raw.tags.length ? { label: "Tags", value: raw.tags.join(", ") } : null,
      ].filter(Boolean),
    };
  }

  if (category === "cards") {
    return {
      ...base,
      subtitle: raw.quote || "",
      quality: raw.quality,
      searchable: [raw.name, raw.quote, raw.description, raw.kind, ...(raw.tags || [])],
      badges: [raw.kind].filter(Boolean),
      detail: [
        raw.description ? { label: "Efecto", value: raw.description } : null,
        raw.tags && raw.tags.length ? { label: "Tags", value: raw.tags.join(", ") } : null,
      ].filter(Boolean),
    };
  }

  if (category === "pills") {
    return {
      ...base,
      subtitle: `Polaridad ${raw.polarity}`,
      quality: null,
      searchable: [raw.name, raw.effect, raw.horse_pill_effect],
      badges: [raw.polarity === "+" ? "Buena" : raw.polarity === "-" ? "Mala" : "Neutra"],
      detail: [
        raw.effect ? { label: "Efecto normal", value: raw.effect } : null,
        raw.horse_pill_effect ? { label: "Horse Pill", value: raw.horse_pill_effect } : null,
      ].filter(Boolean),
    };
  }

  if (category === "characters") {
    return {
      ...base,
      subtitle: raw.tainted ? "Tainted" : "Base",
      quality: null,
      searchable: [raw.name, raw.unlock_requirement],
      badges: raw.tainted ? ["Tainted"] : [],
      detail: [
        raw.unlock_requirement ? { label: "Desbloqueo", value: raw.unlock_requirement } : null,
      ].filter(Boolean),
    };
  }

  return { ...base, subtitle: "", quality: null, searchable: [raw.name], badges: [], detail: [] };
}

let ALL_ENTRIES = [];

function buildEntries() {
  ALL_ENTRIES = [];
  for (const cat of Object.keys(DATA_FILES)) {
    for (const raw of DATA[cat]) {
      ALL_ENTRIES.push(normalizeEntry(cat, raw));
    }
  }
}

// 0 = name starts with query, 1 = name contains query, 2 = matches other fields, -1 = no match
function matchRank(entry, nq) {
  const name = normalizeText(entry.name);
  if (name.startsWith(nq)) return 0;
  if (name.includes(nq)) return 1;
  if (entry.searchable.some((s) => s && normalizeText(s).includes(nq))) return 2;
  return -1;
}

function getFiltered() {
  let list = ALL_ENTRIES;
  if (state.category !== "all") {
    list = list.filter((e) => e.category === state.category);
  }
  if (state.quality.size > 0) {
    list = list.filter((e) => state.quality.has(e.quality));
  }
  if (state.query) {
    const nq = normalizeText(state.query);
    list = list
      .map((e) => ({ e, rank: matchRank(e, nq) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name))
      .map((x) => x.e);
  }
  return state.view === "grid" ? list : list.slice(0, 200);
}

function sortEntries(list) {
  const sorted = [...list];
  if (state.sort === "color") {
    sorted.sort((a, b) => getColor(a).localeCompare(getColor(b)) || (a.raw.id || 0) - (b.raw.id || 0));
  } else if (state.sort === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => (a.raw.id ?? 0) - (b.raw.id ?? 0));
  }
  return sorted;
}

function groupByQuality(list) {
  const groups = new Map(); // quality (0-4 or "none") -> entries
  for (const e of list) {
    const key = e.quality === null || e.quality === undefined ? "none" : e.quality;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const order = [4, 3, 2, 1, 0, "none"];
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)]);
}

function qualityBadgeHtml(q) {
  if (q === null || q === undefined) return "";
  return `<span class="badge quality-${q}">Q${q}</span>`;
}

// Gold/silver/bronze frame for Q4/Q3/Q2 icons; no special frame for Q1/Q0/null.
function qualityIconClass(q) {
  if (q === 4) return "icon-gold";
  if (q === 3) return "icon-silver";
  if (q === 2) return "icon-bronze";
  return "";
}

// starting-items.json / challenges.json store singular type names
// ("item"/"trinket"/"card"); ALL_ENTRIES uses plural category keys.
function pluralCategory(singular) {
  if (singular === "item") return "items";
  if (singular === "trinket") return "trinkets";
  if (singular === "card") return "cards";
  return singular;
}

// Looks up an item/trinket/card by exact display name (used for unlock
// rewards in Marks/Challenges, which only give us a name string, not a
// category+code). Many rewards are cosmetic (baby skins) with no matching
// collectible, so callers must handle a null result.
function findEntryByName(name) {
  if (!name) return null;
  return ALL_ENTRIES.find(
    (e) => ["items", "trinkets", "cards"].includes(e.category) && e.name === name
  );
}

// Small inline "icon + name" reference for an item/trinket/card by code,
// used wherever an item is only *named* (unlocks, rewards) instead of
// being the main subject of a card. Falls back to plain text if not found.
function renderItemRef(category, code, fallbackName) {
  if (!category || !code) {
    return `<span class="item-ref-text">${escapeHtml(fallbackName || "?")}</span>`;
  }
  const entry = ALL_ENTRIES.find((e) => e.category === category && e.code === code);
  if (!entry) {
    return `<span class="item-ref-text">${escapeHtml(fallbackName || code)}</span>`;
  }
  const cls = qualityIconClass(entry.quality);
  const iconHtml = entry.icon
    ? `<img class="item-ref-icon ${cls}" src="${entry.icon}" alt="" loading="lazy">`
    : "";
  return `<span class="item-ref">${iconHtml}<span>${escapeHtml(entry.name)}</span></span>`;
}

function renderSynergies(entry) {
  if (entry.category !== "items") return "";
  const syns = synergyIndex.get(entry.code);
  if (!syns || !syns.length) return "";
  const rows = syns
    .map((s) => {
      const partnerCode = s.item_a_code === entry.code ? s.item_b_code : s.item_a_code;
      const partnerName = s.item_a_code === entry.code ? s.item_b_name : s.item_a_name;
      const selfCombo = s.item_a_code === s.item_b_code;
      const partnerEntry = ALL_ENTRIES.find((e) => e.category === "items" && e.code === partnerCode);
      const partnerIcon = `../data/icons/items/${partnerCode}.png`;
      const iconCls = qualityIconClass(partnerEntry ? partnerEntry.quality : null);
      return `<div class="synergy-item">
        <div class="synergy-partner-row">
          <img class="synergy-icon ${iconCls}" src="${partnerIcon}" alt="" loading="lazy" onerror="this.style.display='none'">
          <div class="synergy-partner">${selfCombo ? "x2 (mismo item)" : partnerName}</div>
        </div>
        <div>${escapeHtml(s.text)}</div>
      </div>`;
    })
    .join("");
  return `<div class="detail-label">Sinergias conocidas (${syns.length})</div>${rows}`;
}

function escapeHtml(s) {
  return (s || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderCard(entry) {
  const detailHtml = entry.detail
    .map((d) => `<div class="detail-label">${d.label}</div><div>${escapeHtml(d.value)}</div>`)
    .join("");
  const synergiesHtml = renderSynergies(entry);
  const catTag = state.category === "all" ? `<span class="badge">${CATEGORY_LABELS[entry.category]}</span>` : "";
  const iconHtml = entry.icon
    ? `<img class="card-icon ${qualityIconClass(entry.quality)}" src="${entry.icon}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-icon card-icon-placeholder"></div>`;

  return `<div class="card" data-code="${entry.category}:${entry.code}">
    <div class="card-head">
      ${iconHtml}
      <div class="card-head-text">
        <div class="card-title">${escapeHtml(entry.name)}</div>
        ${entry.subtitle ? `<div class="card-quote">${escapeHtml(entry.subtitle)}</div>` : ""}
      </div>
      <div class="card-code">${entry.code}</div>
    </div>
    <div class="badges">
      ${catTag}
      ${qualityBadgeHtml(entry.quality)}
      ${entry.badges.map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("")}
    </div>
    <div class="card-detail">
      ${detailHtml}
      ${synergiesHtml}
    </div>
  </div>`;
}

function findEntry(categoryColonCode) {
  return ALL_ENTRIES.find((e) => `${e.category}:${e.code}` === categoryColonCode);
}

function renderDetailPanel() {
  const panel = document.getElementById("detailPanel");
  if (!state.selectedCode) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  const entry = findEntry(state.selectedCode);
  if (!entry) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const detailHtml = entry.detail
    .map((d) => `<div class="detail-label">${d.label}</div><div>${escapeHtml(d.value)}</div>`)
    .join("");
  const iconHtml = entry.icon
    ? `<img class="card-icon ${qualityIconClass(entry.quality)}" src="${entry.icon}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-icon card-icon-placeholder"></div>`;
  panel.innerHTML = `
    <div class="detail-panel-head">
      ${iconHtml}
      <div class="card-head-text">
        <div class="card-title">${escapeHtml(entry.name)}</div>
        ${entry.subtitle ? `<div class="card-quote">${escapeHtml(entry.subtitle)}</div>` : ""}
      </div>
      <div class="card-code">${entry.code}</div>
      <button class="detail-close" id="detailClose">✕</button>
    </div>
    <div class="badges">
      ${qualityBadgeHtml(entry.quality)}
      ${entry.badges.map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("")}
    </div>
    <div class="card-detail expanded-always">
      ${detailHtml}
      ${renderSynergies(entry)}
    </div>
  `;
  document.getElementById("detailClose").addEventListener("click", () => {
    state.selectedCode = null;
    renderDetailPanel();
  });
}

function renderGridTile(entry) {
  const iconHtml = entry.icon
    ? `<img class="tile-icon ${qualityIconClass(entry.quality)}" src="${entry.icon}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="tile-icon"></div>`;
  const selected = state.selectedCode === `${entry.category}:${entry.code}` ? "selected" : "";
  return `<div class="tile ${selected}" data-code="${entry.category}:${entry.code}" title="${escapeHtml(entry.name)}">${iconHtml}</div>`;
}

function renderGrid(results) {
  const resultsEl = document.getElementById("results");
  const groupable = state.category === "items" || state.category === "trinkets";

  let html = `<div class="result-count">${results.length} resultado${results.length === 1 ? "" : "s"}</div>`;

  if (groupable) {
    const groups = groupByQuality(sortEntries(results));
    for (const [q, entries] of groups) {
      const label = q === "none" ? "Sin quality" : `Quality ${q}`;
      html += `<div class="grid-section-label">${label} (${entries.length})</div>`;
      html += `<div class="tile-grid">${entries.map(renderGridTile).join("")}</div>`;
    }
  } else {
    html += `<div class="tile-grid">${sortEntries(results).map(renderGridTile).join("")}</div>`;
  }

  resultsEl.innerHTML = html;
  resultsEl.querySelectorAll(".tile").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.dataset.code;
      state.selectedCode = state.selectedCode === code ? null : code;
      renderDetailPanel();
      resultsEl.querySelectorAll(".tile").forEach((t) => t.classList.toggle("selected", t.dataset.code === state.selectedCode));
    });
  });
}

function renderRoutes() {
  const resultsEl = document.getElementById("results");
  const emptyEl = document.getElementById("empty");
  document.getElementById("detailPanel").classList.add("hidden");
  emptyEl.classList.add("hidden");

  const q = normalizeText(state.query);
  const routes = q
    ? ROUTES.filter((r) => normalizeText(r.name).includes(q) || normalizeText(r.summary).includes(q))
    : ROUTES;

  if (!routes.length) {
    resultsEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }

  resultsEl.innerHTML = routes.map(renderRouteCard).join("");

  resultsEl.querySelectorAll(".route-card-head").forEach((el) => {
    el.addEventListener("click", () => el.parentElement.classList.toggle("expanded"));
  });
}

function renderRouteCard(route) {
  const portraitHtml = route.portrait
    ? `<img class="card-icon" src="../data/${route.portrait}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : `<div class="card-icon card-icon-placeholder"></div>`;
  const stepsHtml = route.steps
    .map(
      (s, i) => `<div class="route-step">
        <div class="route-step-num">${i + 1}</div>
        <div class="route-step-body">
          <div>${escapeHtml(s.text)}</div>
          ${
            s.image
              ? `<img class="route-step-image" src="../data/${s.image}" alt="${escapeHtml(s.image_caption || "")}" loading="lazy">
                 ${s.image_caption ? `<div class="route-step-caption">${escapeHtml(s.image_caption)}</div>` : ""}`
              : ""
          }
        </div>
      </div>`
    )
    .join("");

  return `<div class="card route-card">
    <div class="card-head route-card-head">
      ${portraitHtml}
      <div class="card-head-text">
        <div class="card-title">${escapeHtml(route.name)}</div>
        <div class="card-quote">${escapeHtml(route.summary)}</div>
      </div>
    </div>
    <div class="card-detail route-steps">
      ${stepsHtml}
    </div>
  </div>`;
}

// ---- Marks (completion marks per character) ----

function loadMarksProgress() {
  try {
    marksProgress = JSON.parse(localStorage.getItem(MARKS_PROGRESS_KEY) || "{}");
  } catch {
    marksProgress = {};
  }
}

function saveMarksProgress() {
  localStorage.setItem(MARKS_PROGRESS_KEY, JSON.stringify(marksProgress));
}

function progressKey(charCode, markCode) {
  return `${charCode}:${markCode}`;
}

function marksForCharacter(character) {
  return MARKS.filter((m) => m.tainted === character.tainted);
}

function isMarkDone(charCode, markCode) {
  return !!marksProgress[progressKey(charCode, markCode)];
}

function charProgressCount(character) {
  const applicable = marksForCharacter(character);
  const done = applicable.filter((m) => isMarkDone(character.code, m.code)).length;
  return { done, total: applicable.length };
}

function getMissingCombos() {
  const combos = [];
  for (const character of DATA.characters) {
    for (const mark of marksForCharacter(character)) {
      if (!isMarkDone(character.code, mark.code)) {
        combos.push({ character, mark });
      }
    }
  }
  return combos;
}

function renderDrawResult() {
  const el = document.getElementById("marksDraw");
  if (!state.lastDraw) {
    el.innerHTML = "";
    return;
  }
  const character = DATA.characters.find((c) => c.code === state.lastDraw.charCode);
  const mark = MARKS.find((m) => m.code === state.lastDraw.markCode);
  if (!character || !mark) {
    el.innerHTML = "";
    return;
  }
  const unlock = mark.unlocks[character.name];
  const unlockEntry = findEntryByName(unlock);
  const iconHtml = character.icon
    ? `<img class="draw-icon" src="../data/${character.icon}" alt="" loading="lazy">`
    : "";
  el.innerHTML = `
    <div class="draw-card">
      ${iconHtml}
      <div class="draw-text">
        <div class="draw-line">Ahora juega con <b>${escapeHtml(character.name)}</b></div>
        <div class="draw-line">Objetivo: <b>${escapeHtml(mark.boss)}</b> <span class="text-dim">(marca: ${escapeHtml(mark.name)})</span></div>
        ${
          unlock
            ? `<div class="draw-line draw-unlock">Desbloquea: ${
                unlockEntry ? renderItemRef(unlockEntry.category, unlockEntry.code) : `<b>${escapeHtml(unlock)}</b>`
              }</div>`
            : ""
        }
      </div>
    </div>
  `;
}

function drawRandomRun() {
  const missing = getMissingCombos();
  if (!missing.length) {
    state.lastDraw = null;
    document.getElementById("marksDraw").innerHTML =
      `<div class="draw-card"><div class="draw-text">¡No quedan marcas pendientes! Marca menos cosas como completadas si esto es un error.</div></div>`;
    return;
  }
  const pick = missing[Math.floor(Math.random() * missing.length)];
  state.lastDraw = { charCode: pick.character.code, markCode: pick.mark.code };
  renderDrawResult();
}

function renderMarksCharCard(character) {
  const { done, total } = charProgressCount(character);
  const expanded = state.expandedCharCode === character.code;
  const iconHtml = character.icon
    ? `<img class="card-icon" src="../data/${character.icon}" alt="" loading="lazy">`
    : `<div class="card-icon card-icon-placeholder"></div>`;
  const marksHtml = marksForCharacter(character)
    .map((mark) => {
      const checked = isMarkDone(character.code, mark.code);
      const unlock = mark.unlocks[character.name];
      const unlockEntry = findEntryByName(unlock);
      return `<label class="mark-row">
        <input type="checkbox" data-char="${character.code}" data-mark="${mark.code}" ${checked ? "checked" : ""}>
        <span class="mark-row-text">
          <b>${escapeHtml(mark.name)}</b> — ${escapeHtml(mark.boss)}
          ${
            unlock
              ? `<span class="text-dim"> · desbloquea </span>${
                  unlockEntry ? renderItemRef(unlockEntry.category, unlockEntry.code) : `<span class="text-dim">${escapeHtml(unlock)}</span>`
                }`
              : ""
          }
        </span>
      </label>`;
    })
    .join("");

  return `<div class="card ${expanded ? "expanded" : ""}" data-char-code="${character.code}">
    <div class="card-head marks-card-head">
      ${iconHtml}
      <div class="card-head-text">
        <div class="card-title">${escapeHtml(character.name)}</div>
        <div class="card-quote">${done} / ${total} marcas</div>
      </div>
    </div>
    <div class="card-detail mark-list">
      ${marksHtml}
    </div>
  </div>`;
}

function renderMarks() {
  document.getElementById("detailPanel").classList.add("hidden");
  document.getElementById("empty").classList.add("hidden");
  const resultsEl = document.getElementById("results");

  const q = normalizeText(state.query);
  const characters = q
    ? DATA.characters.filter((c) => normalizeText(c.name).includes(q))
    : DATA.characters;

  const totalDone = DATA.characters.reduce((sum, c) => sum + charProgressCount(c).done, 0);
  const totalMarks = DATA.characters.reduce((sum, c) => sum + charProgressCount(c).total, 0);

  resultsEl.innerHTML = `
    <div class="marks-header">
      <div class="result-count">${totalDone} / ${totalMarks} marcas completadas en total</div>
      <button id="drawBtn" class="draw-btn">🎲 Sortear run pendiente</button>
      <div id="marksDraw"></div>
    </div>
    ${characters.map(renderMarksCharCard).join("")}
  `;

  document.getElementById("drawBtn").addEventListener("click", drawRandomRun);
  renderDrawResult();

  resultsEl.querySelectorAll(".marks-card-head").forEach((el) => {
    el.addEventListener("click", () => {
      const code = el.closest(".card").dataset.charCode;
      state.expandedCharCode = state.expandedCharCode === code ? null : code;
      renderMarks();
    });
  });

  resultsEl.querySelectorAll('input[type="checkbox"][data-char]').forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      const key = progressKey(cb.dataset.char, cb.dataset.mark);
      if (cb.checked) marksProgress[key] = true;
      else delete marksProgress[key];
      saveMarksProgress();
      renderMarks();
    });
  });
}

// ---- Build (character + items in progress, with live synergy hints) ----

function loadBuild() {
  try {
    build = JSON.parse(localStorage.getItem(BUILD_KEY) || "null") || { characterCode: null, itemCodes: [] };
  } catch {
    build = { characterCode: null, itemCodes: [] };
  }
}

function saveBuild() {
  localStorage.setItem(BUILD_KEY, JSON.stringify(build));
}

function buildEntryKey(category, code) {
  return `${category}:${code}`;
}

function findByKey(key) {
  const [category, code] = key.split(":");
  return ALL_ENTRIES.find((e) => e.category === category && e.code === code);
}

function setBuildCharacter(charCode) {
  build.characterCode = charCode;
  build.itemCodes = [];
  const starting = STARTING_ITEMS.find((s) => s.character_code === charCode);
  if (starting) {
    for (const it of starting.starting_items) {
      if (!it.code) continue;
      const cat = it.type === "item" ? "items" : it.type === "trinket" ? "trinkets" : "cards";
      build.itemCodes.push(buildEntryKey(cat, it.code));
    }
  }
  saveBuild();
  renderBuild();
}

function addToBuild(category, code) {
  const key = buildEntryKey(category, code);
  if (!build.itemCodes.includes(key)) build.itemCodes.push(key);
  saveBuild();
  state.query = "";
  renderBuild();
}

function removeFromBuild(key) {
  build.itemCodes = build.itemCodes.filter((k) => k !== key);
  saveBuild();
  renderBuild();
}

function getBuildSynergies() {
  const itemCodes = build.itemCodes
    .filter((k) => k.startsWith("items:"))
    .map((k) => k.split(":")[1]);
  const seen = new Set();
  const results = [];
  for (const s of SYNERGIES) {
    if (s.item_a_code === s.item_b_code) continue; // needs 2 copies, build doesn't track quantities
    const aIn = itemCodes.includes(s.item_a_code);
    const bIn = itemCodes.includes(s.item_b_code);
    if (aIn && bIn) {
      const dedupeKey = [s.item_a_code, s.item_b_code].sort().join("|") + s.text;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      results.push(s);
    }
  }
  return results;
}

function renderBuildEntry(key) {
  const entry = findByKey(key);
  if (!entry) return "";
  const iconHtml = entry.icon
    ? `<img class="build-icon ${qualityIconClass(entry.quality)}" src="${entry.icon}" alt="" loading="lazy">`
    : `<div class="build-icon card-icon-placeholder"></div>`;
  return `<div class="build-chip">
    ${iconHtml}
    <span>${escapeHtml(entry.name)}</span>
    <button class="build-remove" data-key="${key}">✕</button>
  </div>`;
}

function renderBuild() {
  document.getElementById("detailPanel").classList.add("hidden");
  document.getElementById("empty").classList.add("hidden");
  const resultsEl = document.getElementById("results");

  const character = DATA.characters.find((c) => c.code === build.characterCode);
  const charOptions = DATA.characters
    .map((c) => `<option value="${c.code}" ${c.code === build.characterCode ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");

  const buildChips = build.itemCodes.map(renderBuildEntry).join("");
  const synergies = character ? getBuildSynergies() : [];
  const synergiesHtml = synergies.length
    ? synergies
        .map((s) => {
          const aEntry = ALL_ENTRIES.find((e) => e.category === "items" && e.code === s.item_a_code);
          const bEntry = ALL_ENTRIES.find((e) => e.category === "items" && e.code === s.item_b_code);
          return `<div class="synergy-item">
            <div class="synergy-partner-row">
              <img class="synergy-icon ${qualityIconClass(aEntry ? aEntry.quality : null)}" src="${aEntry ? aEntry.icon : ""}" alt="" loading="lazy" onerror="this.style.display='none'">
              <img class="synergy-icon ${qualityIconClass(bEntry ? bEntry.quality : null)}" src="${bEntry ? bEntry.icon : ""}" alt="" loading="lazy" onerror="this.style.display='none'">
              <div class="synergy-partner">${escapeHtml(aEntry ? aEntry.name : "?")} + ${escapeHtml(bEntry ? bEntry.name : "?")}</div>
            </div>
            <div>${escapeHtml(s.text)}</div>
          </div>`;
        })
        .join("")
    : `<div class="text-dim build-empty-msg">${
        build.itemCodes.filter((k) => k.startsWith("items:")).length < 2
          ? "Agregá al menos 2 items para ver sinergias."
          : "No hay sinergias documentadas entre los items actuales (la base cubre 28 items de efectos de lágrimas)."
      }</div>`;

  const searchResults = state.query
    ? (() => {
        const nq = normalizeText(state.query);
        return ALL_ENTRIES
          .filter((e) => ["items", "trinkets", "cards"].includes(e.category))
          .map((e) => ({ e, rank: matchRank(e, nq) }))
          .filter((x) => x.rank >= 0)
          .sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name))
          .slice(0, 8)
          .map((x) => x.e);
      })()
    : [];

  const searchHtml = searchResults
    .map((e) => {
      const already = build.itemCodes.includes(buildEntryKey(e.category, e.code));
      const iconHtml = e.icon ? `<img class="build-icon ${qualityIconClass(e.quality)}" src="${e.icon}" alt="" loading="lazy">` : "";
      return `<div class="build-search-row" data-category="${e.category}" data-code="${e.code}">
        ${iconHtml}
        <span>${escapeHtml(e.name)}</span>
        <button class="build-add" ${already ? "disabled" : ""}>${already ? "Agregado" : "+ Agregar"}</button>
      </div>`;
    })
    .join("");

  resultsEl.innerHTML = `
    <div class="build-header">
      <label class="build-label">Personaje</label>
      <select id="buildCharSelect" class="build-select">
        <option value="">— elegir personaje —</option>
        ${charOptions}
      </select>
      ${character && character.note ? "" : ""}
      ${build.characterCode ? `<button id="buildReset" class="build-reset-btn">Reiniciar build</button>` : ""}
    </div>
    <div class="build-chips">${buildChips || '<div class="text-dim">Sin items todavía.</div>'}</div>
    <div class="detail-label">Agregar item / trinket / carta</div>
    <div class="build-search">${searchHtml}</div>
    <div class="detail-label">Sinergias en esta build</div>
    <div class="build-synergies">${synergiesHtml}</div>
  `;

  document.getElementById("buildCharSelect").addEventListener("change", (e) => {
    if (e.target.value) setBuildCharacter(e.target.value);
  });
  const resetBtn = document.getElementById("buildReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      build = { characterCode: null, itemCodes: [] };
      saveBuild();
      renderBuild();
    });
  }
  resultsEl.querySelectorAll(".build-remove").forEach((btn) => {
    btn.addEventListener("click", () => removeFromBuild(btn.dataset.key));
  });
  resultsEl.querySelectorAll(".build-search-row .build-add:not([disabled])").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".build-search-row");
      addToBuild(row.dataset.category, row.dataset.code);
    });
  });
}

// ---- Challenges ----

function renderChallenges() {
  document.getElementById("detailPanel").classList.add("hidden");
  const resultsEl = document.getElementById("results");
  const emptyEl = document.getElementById("empty");

  const q = normalizeText(state.query);
  const challenges = q
    ? CHALLENGES.filter((c) => normalizeText(c.name).includes(q) || normalizeText(c.unlock_name).includes(q))
    : CHALLENGES;

  if (!challenges.length) {
    resultsEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  const rows = challenges
    .map(
      (c) => `<div class="challenge-row">
        <div class="challenge-name">${escapeHtml(c.name)}</div>
        <div class="challenge-unlock">${renderItemRef(pluralCategory(c.unlock_type), c.unlock_code, c.unlock_name)}</div>
      </div>`
    )
    .join("");

  resultsEl.innerHTML = `
    <div class="result-count">${challenges.length} desafío${challenges.length === 1 ? "" : "s"}</div>
    <div class="challenge-list">${rows}</div>
  `;
}

function render() {
  if (state.category === "challenges") {
    renderChallenges();
    return;
  }
  if (state.category === "build") {
    renderBuild();
    return;
  }
  if (state.category === "marks") {
    renderMarks();
    return;
  }
  if (state.category === "routes") {
    renderRoutes();
    return;
  }

  const results = getFiltered();
  const resultsEl = document.getElementById("results");
  const emptyEl = document.getElementById("empty");

  if (!results.length) {
    resultsEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    renderDetailPanel();
    return;
  }
  emptyEl.classList.add("hidden");

  if (state.view === "grid") {
    renderGrid(results);
    renderDetailPanel();
    return;
  }

  const countHtml = `<div class="result-count">${results.length} resultado${results.length === 1 ? "" : "s"}</div>`;
  resultsEl.innerHTML = countHtml + results.map(renderCard).join("");

  resultsEl.querySelectorAll(".card").forEach((el) => {
    el.querySelector(".card-head").addEventListener("click", () => {
      el.classList.toggle("expanded");
    });
  });
}

function renderCategoryChips() {
  const el = document.getElementById("categories");
  el.innerHTML = Object.keys(CATEGORY_LABELS)
    .map(
      (cat) =>
        `<div class="chip ${state.category === cat ? "active" : ""}" data-cat="${cat}">${CATEGORY_LABELS[cat]}</div>`
    )
    .join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.category = chip.dataset.cat;
      state.quality = new Set();
      renderCategoryChips();
      renderQualityChips();
      renderViewControls();
      renderSortControls();
      render();
    });
  });
}

function renderQualityChips() {
  const el = document.getElementById("qualities");
  const showQuality = state.category === "all" || state.category === "items" || state.category === "trinkets";
  if (!showQuality) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const allActive = state.quality.size === 0;
  const options = [{ label: "Toda quality", val: null }, ...[0, 1, 2, 3, 4].map((q) => ({ label: `Q${q}`, val: q }))];
  el.innerHTML = options
    .map((o) => {
      const active = o.val === null ? allActive : state.quality.has(o.val);
      return `<div class="chip ${active ? "active" : ""}" data-q="${o.val}">${o.label}</div>`;
    })
    .join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const v = chip.dataset.q;
      if (v === "null") {
        state.quality = new Set();
      } else {
        const q = Number(v);
        if (state.quality.has(q)) state.quality.delete(q);
        else state.quality.add(q);
      }
      renderQualityChips();
      render();
    });
  });
}

function renderViewControls() {
  const el = document.getElementById("viewControls");
  if (["routes", "marks", "build", "challenges"].includes(state.category)) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const options = [
    { label: "☰ Lista", val: "list" },
    { label: "▦ Grilla", val: "grid" },
  ];
  el.innerHTML = options
    .map((o) => `<div class="chip ${state.view === o.val ? "active" : ""}" data-view="${o.val}">${o.label}</div>`)
    .join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.view = chip.dataset.view;
      renderViewControls();
      renderSortControls();
      render();
    });
  });
}

function renderSortControls() {
  const el = document.getElementById("sortControls");
  if (state.view !== "grid") {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  const options = [
    { label: "Orden: ID", val: "id" },
    { label: "Orden: Color", val: "color" },
    { label: "Orden: Nombre", val: "name" },
  ];
  el.innerHTML = options
    .map((o) => `<div class="chip ${state.sort === o.val ? "active" : ""}" data-sort="${o.val}">${o.label}</div>`)
    .join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.sort = chip.dataset.sort;
      renderSortControls();
      render();
    });
  });
}

async function loadData() {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([cat, path]) => {
      const res = await fetch(path);
      const json = await res.json();
      return [cat, json];
    })
  );
  for (const [cat, json] of entries) DATA[cat] = json;

  const synRes = await fetch(SYNERGIES_FILE);
  SYNERGIES = await synRes.json();
  buildSynergyIndex();
  buildEntries();

  const routesRes = await fetch(ROUTES_FILE);
  ROUTES = await routesRes.json();

  const marksRes = await fetch(MARKS_FILE);
  MARKS = await marksRes.json();
  loadMarksProgress();

  const startingRes = await fetch(STARTING_ITEMS_FILE);
  STARTING_ITEMS = await startingRes.json();
  loadBuild();

  const challengesRes = await fetch(CHALLENGES_FILE);
  CHALLENGES = await challengesRes.json();
}

async function init() {
  try {
    await loadData();
  } catch (err) {
    document.getElementById("loading").textContent =
      "Error cargando datos. Si abriste el archivo directamente (file://), sírvelo con un servidor local o GitHub Pages.";
    console.error(err);
    return;
  }
  document.getElementById("loading").classList.add("hidden");

  renderCategoryChips();
  renderQualityChips();
  renderViewControls();
  renderSortControls();
  render();

  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });
}

init();
