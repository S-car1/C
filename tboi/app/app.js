const DATA_FILES = {
  items: "../data/items.json",
  trinkets: "../data/trinkets.json",
  cards: "../data/cards-runes.json",
  pills: "../data/pills.json",
  characters: "../data/characters.json",
};
const SYNERGIES_FILE = "../data/synergies.json";

const CATEGORY_LABELS = {
  all: "Todo",
  items: "Items",
  trinkets: "Trinkets",
  cards: "Cartas",
  pills: "Pills",
  characters: "Personajes",
};

let DATA = { items: [], trinkets: [], cards: [], pills: [], characters: [] };
let SYNERGIES = [];
let synergyIndex = new Map(); // code -> [synergy,...]

let state = {
  query: "",
  category: "all",
  quality: null, // null | 0-4
};

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
  if (state.quality !== null) {
    list = list.filter((e) => e.quality === state.quality);
  }
  if (state.query) {
    const nq = normalizeText(state.query);
    list = list
      .map((e) => ({ e, rank: matchRank(e, nq) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name))
      .map((x) => x.e);
  }
  return list.slice(0, 200);
}

function qualityBadgeHtml(q) {
  if (q === null || q === undefined) return "";
  return `<span class="badge quality-${q}">Q${q}</span>`;
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
      const partnerIcon = `../data/icons/items/${partnerCode}.png`;
      return `<div class="synergy-item">
        <div class="synergy-partner-row">
          <img class="synergy-icon" src="${partnerIcon}" alt="" loading="lazy" onerror="this.style.display='none'">
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
    ? `<img class="card-icon" src="${entry.icon}" alt="" loading="lazy" onerror="this.style.display='none'">`
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

function render() {
  const results = getFiltered();
  const resultsEl = document.getElementById("results");
  const emptyEl = document.getElementById("empty");

  if (!results.length) {
    resultsEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

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
      state.quality = null;
      renderCategoryChips();
      renderQualityChips();
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
  const options = [{ label: "Toda quality", val: null }, ...[0, 1, 2, 3, 4].map((q) => ({ label: `Q${q}`, val: q }))];
  el.innerHTML = options
    .map(
      (o) =>
        `<div class="chip ${state.quality === o.val ? "active" : ""}" data-q="${o.val}">${o.label}</div>`
    )
    .join("");
  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const v = chip.dataset.q;
      state.quality = v === "null" ? null : Number(v);
      renderQualityChips();
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
}

async function init() {
  try {
    await loadData();
  } catch (err) {
    document.getElementById("loading").textContent =
      "Error cargando datos. Si abriste el archivo directamente (file://), servilo con un servidor local o GitHub Pages.";
    console.error(err);
    return;
  }
  document.getElementById("loading").classList.add("hidden");

  renderCategoryChips();
  renderQualityChips();
  render();

  const search = document.getElementById("search");
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });
}

init();
