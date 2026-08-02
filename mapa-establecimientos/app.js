const COMUNAS_COBERTURA = ["La Pintana", "El Bosque", "San Bernardo", "Calera De Tango"];
const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";
const TOP_N_RUTA_REAL = 8; // a estos les calculamos ruta real (no solo línea recta)

let establecimientos = [];
let bounds = null; // L.latLngBounds
let boundsPadded = null;
let viewboxStr = ""; // para geocodificación acotada a las 4 comunas

const map = L.map("map", { zoomControl: true, minZoom: 11 });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: 'Datos del mapa © colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
map.attributionControl.setPrefix(false); // saca el "Leaflet" en inglés de la esquina

const iconEscolar = L.divIcon({
  className: "", html: '<div style="background:#1d4ed8;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,.5)"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7]
});
const iconJardin = L.divIcon({
  className: "", html: '<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,.5)"></div>',
  iconSize: [14, 14], iconAnchor: [7, 7]
});
const iconHogar = L.divIcon({
  className: "", html: '<div style="background:#b91c1c;width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 0 3px rgba(0,0,0,.6)"></div>',
  iconSize: [18, 18], iconAnchor: [9, 18]
});

let markers = new Map(); // rbd -> marker
let userMarker = null;
let userLatLng = null;
let userLabel = "";
let searchToken = 0; // para descartar respuestas de búsqueda obsoletas

const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("address-input"),
  status: document.getElementById("search-status"),
  suggestions: document.getElementById("suggestions"),
  filterComuna: document.getElementById("filter-comuna"),
  filterEscolar: document.getElementById("filter-escolar"),
  filterJardin: document.getElementById("filter-jardin"),
  summary: document.getElementById("results-summary"),
  list: document.getElementById("results-list"),
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimarTiempos(km) {
  const caminando = (km / 4.5) * 60;
  const auto = (km / 28) * 60;
  return { caminando: Math.round(caminando), auto: Math.max(1, Math.round(auto)) };
}

function popupHtml(e) {
  const tipoLabel = e.tipo === "jardin" ? "Jardín / Sala cuna" : "Escuela / Liceo";
  return `<b>${e.nombre}</b>
    ${tipoLabel} · ${e.comuna}<br>
    ${e.direccion ? e.direccion : "Dirección de referencia no disponible"}${e.aproximado ? " <span style='color:#b45309'>(aprox.)</span>" : ""}<br>
    RBD ${e.rbd}`;
}

function renderMarkers() {
  establecimientos.forEach(e => {
    const marker = L.marker([e.lat, e.lon], { icon: e.tipo === "jardin" ? iconJardin : iconEscolar });
    marker.bindPopup(popupHtml(e));
    marker.addTo(map);
    markers.set(e.rbd, marker);
  });
}

function populateComunaFilter() {
  COMUNAS_COBERTURA.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c === "Calera De Tango" ? "Calera de Tango" : c;
    el.filterComuna.appendChild(opt);
  });
}

function currentFilters() {
  return {
    comuna: el.filterComuna.value,
    escolar: el.filterEscolar.checked,
    jardin: el.filterJardin.checked,
  };
}

function filteredList() {
  const { comuna, escolar, jardin } = currentFilters();
  return establecimientos.filter(e => {
    if (comuna && e.comuna !== comuna) return false;
    if (e.tipo === "escolar" && !escolar) return false;
    if (e.tipo === "jardin" && !jardin) return false;
    return true;
  });
}

function updateMarkerVisibility() {
  const visibleIds = new Set(filteredList().map(e => e.rbd));
  markers.forEach((marker, rbd) => {
    if (visibleIds.has(rbd)) {
      if (!map.hasLayer(marker)) marker.addTo(map);
    } else {
      map.removeLayer(marker);
    }
  });
}

// ---------- Cálculo de límites del mapa (solo las 4 comunas) ----------

function initBounds() {
  const latLngs = establecimientos.map(e => [e.lat, e.lon]);
  bounds = L.latLngBounds(latLngs);
  boundsPadded = bounds.pad(0.12); // margen para no cortar pines del borde

  map.fitBounds(bounds, { padding: [20, 20] });
  const fittedZoom = map.getZoom();
  map.setMinZoom(Math.max(fittedZoom - 1, 10));
  map.setMaxBounds(boundsPadded);
  map.options.maxBoundsViscosity = 1.0;

  const sw = boundsPadded.getSouthWest();
  const ne = boundsPadded.getNorthEast();
  // Nominatim viewbox: izq,arriba,der,abajo (lon,lat)
  viewboxStr = `${sw.lng},${ne.lat},${ne.lng},${sw.lat}`;
}

// ---------- Autocompletado de direcciones (estilo Google Maps) ----------

let debounceTimer = null;
let activeSuggestionIndex = -1;
let currentSuggestions = [];

function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function fetchSuggestions(query) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "6",
    countrycodes: "cl",
    viewbox: viewboxStr,
    bounded: "1" // prioriza resultados DENTRO de las 4 comunas
  });
  const resp = await fetch(`${NOMINATIM}/search?${params}`, { headers: { "Accept-Language": "es" } });
  if (!resp.ok) throw new Error("geocoder falló");
  let data = await resp.json();

  // Si acotar estrictamente a las comunas no arrojó nada (p.ej. dirección mal escrita),
  // reintenta sin la restricción dura para no dejar al usuario sin opciones.
  if (!data.length) {
    const params2 = new URLSearchParams({
      q: `${query}, Región Metropolitana, Chile`, format: "json", addressdetails: "1",
      limit: "6", countrycodes: "cl", viewbox: viewboxStr, bounded: "0"
    });
    const resp2 = await fetch(`${NOMINATIM}/search?${params2}`, { headers: { "Accept-Language": "es" } });
    if (resp2.ok) data = await resp2.json();
  }
  return data;
}

function renderSuggestions(items) {
  currentSuggestions = items;
  activeSuggestionIndex = -1;
  el.suggestions.innerHTML = "";
  if (!items.length) {
    el.suggestions.classList.remove("open");
    return;
  }
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "suggestion";
    li.setAttribute("role", "option");
    const dentro = isWithinComunas(parseFloat(item.lat), parseFloat(item.lon));
    li.innerHTML = `
      <span class="s-icon">${dentro ? "📍" : "🌎"}</span>
      <span class="s-text">${item.display_name}</span>
    `;
    li.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      chooseSuggestion(item);
    });
    el.suggestions.appendChild(li);
  });
  el.suggestions.classList.add("open");
}

function isWithinComunas(lat, lon) {
  if (!boundsPadded) return true;
  return boundsPadded.contains([lat, lon]);
}

function chooseSuggestion(item) {
  el.input.value = item.display_name;
  el.suggestions.classList.remove("open");
  setUserLocation(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
}

el.input.addEventListener("input", () => {
  const query = el.input.value.trim();
  clearTimeout(debounceTimer);
  if (query.length < 3) {
    el.suggestions.classList.remove("open");
    return;
  }
  debounceTimer = setTimeout(async () => {
    const token = ++searchToken;
    try {
      const items = await fetchSuggestions(query);
      if (token !== searchToken) return; // respuesta obsoleta
      renderSuggestions(items);
    } catch (e) {
      // fallo silencioso del autocompletado, el usuario puede igual presionar Enter
    }
  }, 300);
});

el.input.addEventListener("keydown", (ev) => {
  const open = el.suggestions.classList.contains("open");
  if (ev.key === "ArrowDown" && open) {
    ev.preventDefault();
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, currentSuggestions.length - 1);
    highlightSuggestion();
  } else if (ev.key === "ArrowUp" && open) {
    ev.preventDefault();
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
    highlightSuggestion();
  } else if (ev.key === "Escape") {
    el.suggestions.classList.remove("open");
  }
});

function highlightSuggestion() {
  [...el.suggestions.children].forEach((li, i) => {
    li.classList.toggle("active", i === activeSuggestionIndex);
  });
  const active = el.suggestions.children[activeSuggestionIndex];
  if (active) active.scrollIntoView({ block: "nearest" });
}

document.addEventListener("click", (ev) => {
  if (!el.suggestions.contains(ev.target) && ev.target !== el.input) {
    el.suggestions.classList.remove("open");
  }
});

el.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
    chooseSuggestion(currentSuggestions[activeSuggestionIndex]);
    return;
  }
  if (currentSuggestions.length) {
    chooseSuggestion(currentSuggestions[0]);
    return;
  }
  const query = el.input.value.trim();
  if (!query) return;
  el.status.textContent = "Buscando dirección...";
  el.status.classList.remove("error");
  try {
    const items = await fetchSuggestions(query);
    if (!items.length) throw new Error("No se encontró esa dirección. Intenta con más detalle (calle, número, comuna).");
    chooseSuggestion(items[0]);
  } catch (err) {
    el.status.textContent = err.message || "No se pudo buscar la dirección.";
    el.status.classList.add("error");
  }
});

// ---------- Clic en el mapa: geocodificación inversa (como Google Maps) ----------

map.on("click", async (ev) => {
  const { lat, lng } = ev.latlng;
  el.status.textContent = "Buscando la dirección de este punto...";
  el.status.classList.remove("error");
  try {
    const params = new URLSearchParams({ lat, lon: lng, format: "json", zoom: "18", addressdetails: "1" });
    const resp = await fetch(`${NOMINATIM}/reverse?${params}`, { headers: { "Accept-Language": "es" } });
    if (!resp.ok) throw new Error("No se pudo obtener la dirección de ese punto.");
    const data = await resp.json();
    const label = data.display_name || `Punto seleccionado (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    el.input.value = label;
    setUserLocation(lat, lng, label);
  } catch (err) {
    setUserLocation(lat, lng, `Punto seleccionado (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    el.status.textContent = "No pude identificar la dirección exacta de ese punto, pero igual quedó marcado.";
  }
});

function setUserLocation(lat, lng, label) {
  userLatLng = L.latLng(lat, lng);
  userLabel = label;

  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.marker(userLatLng, { icon: iconHogar, draggable: true }).addTo(map);
  userMarker.bindPopup(`<b>Tu dirección</b>${label}`).openPopup();
  userMarker.on("dragend", () => {
    const p = userMarker.getLatLng();
    reverseFromDrag(p.lat, p.lng);
  });

  map.panTo(userLatLng);
  if (map.getZoom() < 14) map.setZoom(14);
  el.status.textContent = `Ubicación: ${label}`;
  el.status.classList.remove("error");
  renderResults();
}

async function reverseFromDrag(lat, lng) {
  try {
    const params = new URLSearchParams({ lat, lon: lng, format: "json", zoom: "18" });
    const resp = await fetch(`${NOMINATIM}/reverse?${params}`, { headers: { "Accept-Language": "es" } });
    const data = await resp.json();
    const label = data.display_name || `Punto (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    el.input.value = label;
    userLatLng = L.latLng(lat, lng);
    userLabel = label;
    userMarker.setPopupContent(`<b>Tu dirección</b>${label}`);
    el.status.textContent = `Ubicación: ${label}`;
    renderResults();
  } catch (e) { /* deja la posición igual si falla */ }
}

// ---------- Rutas reales (OSRM) para los más cercanos ----------

async function rutaReal(perfil, origen, destino) {
  const url = `${OSRM}/route/v1/${perfil}/${origen.lng},${origen.lat};${destino.lon},${destino.lat}?overview=false`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("sin ruta");
  const data = await resp.json();
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("sin ruta");
  const r = data.routes[0];
  return { km: r.distance / 1000, min: Math.round(r.duration / 60) };
}

async function enriquecerConRutaReal(items, renderToken) {
  await Promise.all(items.map(async (item) => {
    try {
      const [walk, drive] = await Promise.all([
        rutaReal("foot", userLatLng, item),
        rutaReal("driving", userLatLng, item),
      ]);
      item.rutaReal = { walk, drive };
    } catch (e) {
      // sin ruta real disponible; se queda con la estimación en línea recta
    }
    if (renderToken === searchToken) actualizarTarjeta(item);
  }));
}

function actualizarTarjeta(item) {
  const card = el.list.querySelector(`.result-item[data-rbd="${item.rbd}"]`);
  if (!card || !item.rutaReal) return;
  const metaEl = card.querySelector(".meta-tiempos");
  if (!metaEl) return;
  metaEl.innerHTML = `
    <span class="dist">${item.rutaReal.walk.km.toFixed(2)} km</span> por calles
    · 🚶 ${item.rutaReal.walk.min} min · 🚗 ${item.rutaReal.drive.min} min
    <span class="ruta-real-flag">ruta real</span>
  `;
}

// ---------- Render de resultados ----------

function render() {
  updateMarkerVisibility();
  renderResults();
}

function renderResults() {
  const list = filteredList();
  const token = ++searchToken;

  if (!userLatLng) {
    el.summary.textContent = `${list.length} establecimientos en el mapa. Ingresa tu dirección, escribe una calle, o haz clic en el mapa.`;
    el.list.innerHTML = "";
    return;
  }

  const withDist = list.map(e => ({
    ...e,
    km: haversineKm(userLatLng.lat, userLatLng.lng, e.lat, e.lon)
  })).sort((a, b) => a.km - b.km);

  el.summary.textContent = `${withDist.length} establecimientos ordenados por cercanía a "${userLabel}".`;
  el.list.innerHTML = "";

  withDist.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = `result-item ${e.tipo}`;
    li.dataset.rbd = e.rbd;
    const t = estimarTiempos(e.km);
    li.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="nombre">${e.nombre}</span>
      <div class="meta">
        ${e.comuna} ·
        <span class="meta-tiempos">
          <span class="dist">${e.km.toFixed(2)} km</span> en línea recta
          · ~${t.caminando} min caminando · ~${t.auto} min en auto
        </span>
        ${e.aproximado ? '<br><span class="approx-flag">Ubicación aproximada, en verificación</span>' : ""}
      </div>
    `;
    li.addEventListener("click", () => {
      map.setView([e.lat, e.lon], 16);
      const marker = markers.get(e.rbd);
      if (marker) marker.openPopup();
    });
    el.list.appendChild(li);
  });

  // Mejora progresiva: a los más cercanos les calculamos ruta real (calles), no solo línea recta.
  enriquecerConRutaReal(withDist.slice(0, TOP_N_RUTA_REAL), token);
}

el.filterComuna.addEventListener("change", render);
el.filterEscolar.addEventListener("change", render);
el.filterJardin.addEventListener("change", render);

async function init() {
  const resp = await fetch("data/establecimientos.json");
  establecimientos = await resp.json();
  populateComunaFilter();
  initBounds();
  renderMarkers();
  renderResults();
}

init();
