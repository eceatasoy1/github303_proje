const CONFIG = {
  API_BASE: "http://localhost:8000/api",
  WS_BASE: "ws://localhost:8000/ws",
  USE_MOCK: "auto",
};

const QUALITY_LABELS = { good: "İyi", medium: "Orta", bad: "Kötü", processing: "Analizde" };
const QUALITY_COLORS = { good: "#22a06b", medium: "#d9911a", bad: "#d64545" };
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function mediaUrl(url) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return CONFIG.API_BASE.replace(/\/api$/, "") + url; 
}

function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function classify(score) {
  if (score >= 70) return "good";
  if (score >= 40) return "medium";
  return "bad";
}

const realApi = {
  async request(path, options = {}) {
    const res = await fetch(CONFIG.API_BASE + path, options);
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    return res.json();
  },

  health() { return this.request("/health"); },
  getEvents() { return this.request("/events"); },
  createEvent(data) {
    return this.request("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },
  getStats(eventId) { return this.request(`/events/${eventId}/stats`); },
  getPhotos(eventId, { quality = "", sort = "newest" } = {}) {
    const params = new URLSearchParams({ sort });
    if (quality) params.set("quality", quality);
    return this.request(`/events/${eventId}/photos?${params}`);
  },
  getPhoto(id) { return this.request(`/photos/${id}`); },
  deletePhoto(id) { return this.request(`/photos/${id}`, { method: "DELETE" }); },

  uploadPhoto(eventId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("files", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${CONFIG.API_BASE}/events/${eventId}/photos`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) return reject(new Error(data.detail || "Yükleme hatası"));
          if (data.failed?.length) return reject(new Error(data.failed[0].error));
          resolve(data.uploaded[0]);
        } catch { reject(new Error("Sunucudan geçersiz cevap")); }
      };
      xhr.onerror = () => reject(new Error("Sunucuya ulaşılamadı"));
      xhr.send(form);
    });
  },
};

const mockApi = (() => {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.random() * (max - min) + min;

  function fakeImage(seed) {
    const hue = (seed * 47) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue},65%,62%)"/>
        <stop offset="1" stop-color="hsl(${(hue + 60) % 360},55%,35%)"/>
      </linearGradient></defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <circle cx="${200 + (seed * 37) % 400}" cy="${180 + (seed * 13) % 200}" r="${60 + (seed % 5) * 20}" fill="rgba(255,255,255,.25)"/>
      <circle cx="${120 + (seed * 71) % 560}" cy="${330 + (seed * 29) % 150}" r="${40 + (seed % 4) * 15}" fill="rgba(255,255,255,.18)"/>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  let nextPhotoId = 1;
  function makePhoto(eventId, { filename, url, uploadedAt } = {}) {
    const id = nextPhotoId++;
    const score = Math.round(rand(15, 98) * 10) / 10;
    return {
      id, event_id: eventId,
      filename: filename || `IMG_${2000 + id}.jpg`,
      url: url || fakeImage(id),
      thumbnail_url: url || fakeImage(id),
      uploaded_at: uploadedAt || new Date().toISOString(),
      status: "done",
      quality_class: classify(score),
      quality_score: score,
      sharpness: Math.round(Math.min(1, score / 100 + rand(-0.1, 0.1)) * 100) / 100,
      brightness: Math.round(rand(0.3, 0.9) * 100) / 100,
      faces: Math.floor(rand(0, 8)),
      width: 4032, height: 3024,
    };
  }

  const events = [
    { id: 1, name: "Sanne & Tom Düğünü", date: "2026-10-24", location: "İstanbul", guest_count: 142, video_count: 18 },
    { id: 2, name: "Mezuniyet Töreni 2026", date: "2026-06-20", location: "Ankara", guest_count: 310, video_count: 7 },
  ];
  const photos = [];
  events.forEach((ev, idx) => {
    const count = idx === 0 ? 36 : 14;
    const start = new Date(`${ev.date}T18:00:00`).getTime();
    for (let i = 0; i < count; i++) {
      photos.push(makePhoto(ev.id, { uploadedAt: new Date(start + rand(0, 6 * 3600e3)).toISOString() }));
    }
  });

  function sortPhotos(list, sort) {
    const copy = [...list];
    if (sort === "score_desc") copy.sort((a, b) => b.quality_score - a.quality_score);
    else if (sort === "score_asc") copy.sort((a, b) => a.quality_score - b.quality_score);
    else copy.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
    return copy;
  }

  return {
    photos, makePhoto, 

    async health() { await delay(100); return { status: "ok" }; },
    async getEvents() { await delay(150); return events.map((e) => ({ ...e })); },
    async createEvent(data) {
      await delay(200);
      const ev = { id: events.length + 1, video_count: 0, ...data, guest_count: Number(data.guest_count) || 0 };
      events.push(ev);
      return ev;
    },
    async getStats(eventId) {
      await delay(200);
      const ev = events.find((e) => e.id === eventId);
      const list = photos.filter((p) => p.event_id === eventId && p.status === "done");
      const dist = { good: 0, medium: 0, bad: 0 };
      const hours = {};
      const hist = [0, 0, 0, 0, 0];
      list.forEach((p) => {
        dist[p.quality_class]++;
        const h = new Date(p.uploaded_at).getHours().toString().padStart(2, "0") + ":00";
        hours[h] = (hours[h] || 0) + 1;
        hist[Math.min(4, Math.floor(p.quality_score / 20))]++;
      });
      const avg = list.length ? list.reduce((s, p) => s + p.quality_score, 0) / list.length : 0;
      return {
        photo_count: photos.filter((p) => p.event_id === eventId).length,
        video_count: ev?.video_count || 0,
        guest_count: ev?.guest_count || 0,
        avg_quality: Math.round(avg * 10) / 10,
        quality_distribution: dist,
        uploads_by_hour: Object.keys(hours).sort().map((hour) => ({ hour, count: hours[hour] })),
        score_histogram: ["0-20", "20-40", "40-60", "60-80", "80-100"].map((range, i) => ({ range, count: hist[i] })),
      };
    },
    async getPhotos(eventId, { quality = "", sort = "newest" } = {}) {
      await delay(150);
      let list = photos.filter((p) => p.event_id === eventId);
      if (quality) list = list.filter((p) => p.quality_class === quality);
      return sortPhotos(list, sort);
    },
    async getPhoto(id) { await delay(80); return photos.find((p) => p.id === id); },
    async deletePhoto(id) {
      await delay(150);
      const i = photos.findIndex((p) => p.id === id);
      if (i >= 0) photos.splice(i, 1);
      return { deleted: true };
    },
    async uploadPhoto(eventId, file, onProgress) {
      for (let p = 0; p <= 1; p += 0.2) { onProgress(p); await delay(120); }
      onProgress(1);
      await delay(400); 
      const photo = makePhoto(eventId, { filename: file.name, url: URL.createObjectURL(file) });
      photos.push(photo);
      return photo;
    },
  };
})();

const state = {
  api: realApi,
  mode: "online",         
  events: [],
  eventId: null,
  view: "dashboard",
  gallery: { quality: "", sort: "newest", search: "" },
  photos: [],             
  charts: {},
  socket: null,
  demoTimer: null,
  openPhotoId: null,
};

async function detectBackend() {
  if (CONFIG.USE_MOCK === true) return setMode("demo");
  if (CONFIG.USE_MOCK === false) return setMode("online");
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(CONFIG.API_BASE + "/health", { signal: ctrl.signal });
    setMode(res.ok ? "online" : "demo");
  } catch {
    setMode("demo");
  }
}

function setMode(mode) {
  state.mode = mode;
  state.api = mode === "demo" ? mockApi : realApi;
  const el = $("#connStatus");
  el.className = `conn ${mode}`;
  el.querySelector(".conn-label").textContent = mode === "demo" ? "Demo modu" : "Backend bağlı";
  el.title = mode === "demo"
    ? "Backend'e ulaşılamadı, örnek verilerle çalışılıyor"
    : `Bağlı: ${CONFIG.API_BASE}`;
}


function connectLive() {
  if (state.socket) { state.socket.onclose = null; state.socket.close(); state.socket = null; }
  clearInterval(state.demoTimer);

  if (state.mode === "demo") {
    state.demoTimer = setInterval(() => {
      const photo = mockApi.makePhoto(state.eventId, { filename: `misafir_${Date.now() % 10000}.jpg` });
      mockApi.photos.push(photo);
      handleLiveMessage({ type: "photo_uploaded", photo });
    }, 25000);
    return;
  }

  const ws = new WebSocket(`${CONFIG.WS_BASE}/events/${state.eventId}`);
  ws.onmessage = (e) => {
    try { handleLiveMessage(JSON.parse(e.data)); } catch {}
  };
  ws.onclose = () => {
    setTimeout(() => { if (state.socket === ws) connectLive(); }, 5000);
  };
  state.socket = ws;
}

function handleLiveMessage(msg) {
  if (!msg?.photo || msg.photo.event_id !== state.eventId) return;
  if (msg.type === "photo_uploaded") toast(`Yeni fotoğraf: ${msg.photo.filename}`, "info");
  if (msg.type === "analysis_done") toast(`Analiz bitti: ${msg.photo.filename} (${QUALITY_LABELS[msg.photo.quality_class]})`, "success");
  refreshCurrentView({ highlightId: msg.photo.id });
}

async function loadEvents(selectId) {
  try {
    state.events = await state.api.getEvents();
  } catch (err) {
    toast("Etkinlikler alınamadı: " + err.message, "error");
    state.events = [];
  }
  const select = $("#eventSelect");
  select.innerHTML = state.events.length
    ? state.events.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("")
    : `<option value="">Etkinlik yok</option>`;

  if (!state.events.length) { state.eventId = null; renderEventHeader(); return; }

  const saved = Number(localStorageGet("qever-event"));
  const pick = selectId || (state.events.some((e) => e.id === saved) ? saved : state.events[0].id);
  select.value = pick;
  await selectEvent(pick);
}

async function selectEvent(id) {
  state.eventId = Number(id);
  localStorageSet("qever-event", state.eventId);
  renderEventHeader();
  connectLive();
  await refreshCurrentView();
}

function renderEventHeader() {
  const ev = state.events.find((e) => e.id === state.eventId);
  $("#eventTitle").textContent = ev ? ev.name : "Etkinlik seçilmedi";
  $("#eventMeta").textContent = ev
    ? [ev.date && new Date(ev.date).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }), ev.location].filter(Boolean).join(" · ")
    : "Başlamak için yeni bir etkinlik oluştur.";
}

function localStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localStorageSet(key, val) { try { localStorage.setItem(key, val); } catch {} }
function showView(name) {
  state.view = name;
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  refreshCurrentView();
}

async function refreshCurrentView(opts = {}) {
  if (!state.eventId) return;
  try {
    if (state.view === "dashboard") await renderDashboard(opts);
    if (state.view === "gallery") await renderGallery(opts);
    if (state.view === "stats") await renderStats();
  } catch (err) {
    toast("Veri alınamadı: " + err.message, "error");
  }
}

function photoCard(p, highlightId) {
  const processing = p.status === "processing";
  const cls = processing ? "processing" : p.quality_class;
  return `
    <div class="photo ${processing ? "processing" : ""} ${p.id === highlightId ? "new" : ""}" data-id="${p.id}">
      <img src="${escapeHtml(mediaUrl(p.thumbnail_url || p.url))}" alt="${escapeHtml(p.filename)}" loading="lazy">
      <span class="badge ${cls}">${QUALITY_LABELS[cls] || "-"}</span>
      ${processing ? "" : `<span class="score">${Math.round(p.quality_score)}</span>`}
    </div>`;
}

async function renderDashboard({ highlightId } = {}) {
  const [stats, photos] = await Promise.all([
    state.api.getStats(state.eventId),
    state.api.getPhotos(state.eventId, { sort: "newest" }),
  ]);
  $("#statPhotos").textContent = stats.photo_count;
  $("#statVideos").textContent = stats.video_count;
  $("#statGuests").textContent = stats.guest_count;
  $("#statQuality").textContent = stats.avg_quality ? stats.avg_quality.toFixed(1) : "–";

  const recent = photos.slice(0, 12);
  $("#recentGrid").innerHTML = recent.map((p) => photoCard(p, highlightId)).join("");
  $("#recentEmpty").hidden = recent.length > 0;
}

async function renderGallery({ highlightId, useCache } = {}) {
  if (!useCache) {
    state.photos = await state.api.getPhotos(state.eventId, {
      quality: state.gallery.quality,
      sort: state.gallery.sort,
    });
  }
  const q = state.gallery.search.trim().toLowerCase();
  const list = q ? state.photos.filter((p) => p.filename.toLowerCase().includes(q)) : state.photos;

  $("#galleryGrid").innerHTML = list.map((p) => photoCard(p, highlightId)).join("");
  $("#galleryEmpty").hidden = list.length > 0;
  $("#galleryCount").textContent = `${list.length} fotoğraf`;
}


async function renderStats() {
  if (typeof Chart === "undefined") { toast("Grafik kütüphanesi yüklenemedi (internet bağlantısı?)", "error"); return; }
  const s = await state.api.getStats(state.eventId);
  Chart.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif';
  Chart.defaults.color = "#7a736d";

  drawChart("quality", "#chartQuality", {
    type: "doughnut",
    data: {
      labels: ["İyi", "Orta", "Kötü"],
      datasets: [{
        data: [s.quality_distribution.good, s.quality_distribution.medium, s.quality_distribution.bad],
        backgroundColor: [QUALITY_COLORS.good, QUALITY_COLORS.medium, QUALITY_COLORS.bad],
        borderWidth: 0,
      }],
    },
    options: { cutout: "65%", plugins: { legend: { position: "bottom" } } },
  });

  drawChart("hourly", "#chartHourly", {
    type: "bar",
    data: {
      labels: s.uploads_by_hour.map((h) => h.hour),
      datasets: [{ label: "Yükleme", data: s.uploads_by_hour.map((h) => h.count), backgroundColor: "#ef6a4c", borderRadius: 6 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  drawChart("histogram", "#chartHistogram", {
    type: "bar",
    data: {
      labels: s.score_histogram.map((h) => h.range),
      datasets: [{
        label: "Fotoğraf sayısı",
        data: s.score_histogram.map((h) => h.count),
        backgroundColor: ["#d64545", "#e2763a", "#d9911a", "#7dbb5a", "#22a06b"],
        borderRadius: 6,
      }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

function drawChart(key, selector, config) {
  state.charts[key]?.destroy();
  config.options = { responsive: true, maintainAspectRatio: false, ...config.options };
  state.charts[key] = new Chart($(selector), config);
}


async function handleFiles(fileList) {
  if (!state.eventId) { toast("Önce bir etkinlik seç veya oluştur.", "error"); return; }
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) { toast("Lütfen fotoğraf dosyası seç.", "error"); return; }
  
  const queue = [...files];
  const worker = async () => {
    while (queue.length) await uploadOne(queue.shift());
  };
  await Promise.all([worker(), worker(), worker()]);
  toast(`${files.length} fotoğraf işlendi`, "success");
}

async function uploadOne(file) {
  const li = document.createElement("li");
  li.className = "upload-item";
  const preview = URL.createObjectURL(file);
  li.innerHTML = `
    <img src="${preview}" alt="">
    <div>
      <div class="name">${escapeHtml(file.name)}</div>
      <div class="progress"><i></i></div>
    </div>
    <span class="upload-status">Yükleniyor…</span>`;
  $("#uploadList").prepend(li);
  const bar = li.querySelector(".progress i");
  const status = li.querySelector(".upload-status");

  try {
    const photo = await state.api.uploadPhoto(state.eventId, file, (p) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      if (p >= 1) status.textContent = "Analiz ediliyor…";
    });
    li.classList.add("done");
    bar.style.width = "100%";
    status.innerHTML = photo.status === "processing"
      ? `<span class="badge processing">Analizde</span>`
      : `<span class="badge ${photo.quality_class}">${QUALITY_LABELS[photo.quality_class]} · ${Math.round(photo.quality_score)}</span>`;
  } catch (err) {
    li.classList.add("error");
    bar.style.width = "100%";
    status.textContent = "Hata: " + err.message;
  }
}


async function openPhoto(id) {
  let p;
  try { p = await state.api.getPhoto(id); } catch (err) { toast(err.message, "error"); return; }
  if (!p) return;
  state.openPhotoId = p.id;

  $("#detailImg").src = mediaUrl(p.url);
  $("#detailName").textContent = p.filename;
  $("#detailDate").textContent = formatDate(p.uploaded_at);

  const cls = p.status === "processing" ? "processing" : p.quality_class;
  const badge = $("#detailBadge");
  badge.className = `badge ${cls}`;
  badge.textContent = QUALITY_LABELS[cls];

  const score = Math.round(p.quality_score || 0);
  const ring = $("#detailRing");
  ring.style.setProperty("--p", score);
  ring.style.setProperty("--c", QUALITY_COLORS[p.quality_class] || "#bbb");
  $("#detailScore").textContent = score;

  const pct = (v) => `${Math.round((v || 0) * 100)}%`;
  $("#detailSharp").style.width = pct(p.sharpness);
  $("#detailSharpVal").textContent = pct(p.sharpness);
  $("#detailBright").style.width = pct(p.brightness);
  $("#detailBrightVal").textContent = pct(p.brightness);
  $("#detailFaces").textContent = p.faces ?? "–";
  $("#detailRes").textContent = p.width ? `${p.width} × ${p.height}` : "–";

  $("#photoModal").showModal();
}

async function deleteOpenPhoto() {
  if (!state.openPhotoId || !confirm("Bu fotoğraf silinsin mi?")) return;
  try {
    await state.api.deletePhoto(state.openPhotoId);
    $("#photoModal").close();
    toast("Fotoğraf silindi", "success");
    refreshCurrentView();
  } catch (err) {
    toast("Silinemedi: " + err.message, "error");
  }
}


function bindEvents() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.goto)));

  $("#eventSelect").addEventListener("change", (e) => e.target.value && selectEvent(e.target.value));


  $("#newEventBtn").addEventListener("click", () => {
    $("#eventForm").reset();
    $("#eventForm").date.value = new Date().toISOString().slice(0, 10);
    $("#eventModal").showModal();
  });
  $("#eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    data.guest_count = Number(data.guest_count) || 0;
    try {
      const ev = await state.api.createEvent(data);
      $("#eventModal").close();
      toast(`"${ev.name}" oluşturuldu`, "success");
      await loadEvents(ev.id);
    } catch (err) {
      toast("Oluşturulamadı: " + err.message, "error");
    }
  });

  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
  });


  ["#recentGrid", "#galleryGrid"].forEach((sel) => {
    $(sel).addEventListener("click", (e) => {
      const card = e.target.closest(".photo");
      if (card) openPhoto(Number(card.dataset.id));
    });
  });
  $("#deletePhotoBtn").addEventListener("click", deleteOpenPhoto);


  $("#qualityChips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    state.gallery.quality = chip.dataset.quality;
    renderGallery();
  });
  $("#sortSelect").addEventListener("change", (e) => { state.gallery.sort = e.target.value; renderGallery(); });
  $("#searchInput").addEventListener("input", (e) => { state.gallery.search = e.target.value; renderGallery({ useCache: true }); });


  const dz = $("#dropzone");
  $("#fileInput").addEventListener("change", (e) => { handleFiles(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
}


(async function init() {
  bindEvents();
  await detectBackend();
  if (state.mode === "demo") toast("Backend kapalı, demo verileriyle çalışılıyor", "info");
  await loadEvents();
})();
