const COMUNAS_COBERTURA = ["La Pintana", "El Bosque", "San Bernardo", "Calera De Tango"];

// Caja aproximada que cubre las 4 comunas, usada para priorizar resultados de geocodificación.
const VIEWBOX = "-70.75,-33.50,-70.60,-33.66"; // izq,arriba,der,abajo (lon,lat)

const map = L.map("map", { zoomControl: true }).setView([-33.585, -70.665], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

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

let establecimientos = [];
let markers = new Map(); // rbd -> marker
let userMarker = null;
let userLatLng = null;

const el = {
  form: document.getElementById("search-form"),
  input: document.getElementById("address-input"),
  status: document.getElementById("search-status"),
  filterComuna: document.getElementById("filter-comuna"),
  filterTipo: document.getElementById("filter-tipo"),
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
  const caminando = (km / 4.5) * 60; // minutos, 4.5 km/h
  const auto = (km / 28) * 60; // minutos, velocidad urbana promedio
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
  return { comuna: el.filterComuna.value, tipo: el.filterTipo.value };
}

function filteredList() {
  const { comuna, tipo } = currentFilters();
  return establecimientos.filter(e =>
    (!comuna || e.comuna === comuna) && (!tipo || e.tipo === tipo)
  );
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

function renderResults() {
  const list = filteredList();

  if (!userLatLng) {
    el.summary.textContent = `${list.length} establecimientos en el mapa. Ingresa tu dirección para ordenarlos por cercanía.`;
    el.list.innerHTML = "";
    return;
  }

  const withDist = list.map(e => ({
    ...e,
    km: haversineKm(userLatLng.lat, userLatLng.lng, e.lat, e.lon)
  })).sort((a, b) => a.km - b.km);

  el.summary.textContent = `${withDist.length} establecimientos ordenados por distancia a tu dirección.`;
  el.list.innerHTML = "";

  withDist.forEach((e, i) => {
    const li = document.createElement("li");
    li.className = `result-item ${e.tipo}`;
    const t = estimarTiempos(e.km);
    li.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="nombre">${e.nombre}</span>
      <div class="meta">
        ${e.comuna} · <span class="distancia">${e.km.toFixed(2)} km</span>
        · ~${t.caminando} min caminando · ~${t.auto} min en auto
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
}

async function geocodeAddress(query) {
  const params = new URLSearchParams({
    q: `${query}, Región Metropolitana, Chile`,
    format: "json",
    limit: "1",
    countrycodes: "cl",
    viewbox: VIEWBOX,
    bounded: "0"
  });
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "Accept-Language": "es" }
  });
  if (!resp.ok) throw new Error("No se pudo consultar el geocodificador.");
  const data = await resp.json();
  if (!data.length) throw new Error("No se encontró esa dirección. Intenta con más detalle (calle, número, comuna).");
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

el.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const query = el.input.value.trim();
  if (!query) return;

  el.status.textContent = "Buscando dirección...";
  el.status.classList.remove("error");

  try {
    const result = await geocodeAddress(query);
    userLatLng = L.latLng(result.lat, result.lng);

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker(userLatLng, { icon: iconHogar }).addTo(map);
    userMarker.bindPopup(`<b>Tu dirección</b>${result.label}`).openPopup();

    map.setView(userLatLng, 14);
    el.status.textContent = `Ubicación encontrada: ${result.label}`;
    renderResults();
  } catch (err) {
    el.status.textContent = err.message;
    el.status.classList.add("error");
  }
});

el.filterComuna.addEventListener("change", () => { updateMarkerVisibility(); renderResults(); });
el.filterTipo.addEventListener("change", () => { updateMarkerVisibility(); renderResults(); });

async function init() {
  const resp = await fetch("data/establecimientos.json");
  establecimientos = await resp.json();
  populateComunaFilter();
  renderMarkers();
  renderResults();
}

init();
