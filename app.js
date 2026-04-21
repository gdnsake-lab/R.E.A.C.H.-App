// R.E.A.C.H. — static, sheet-backed resource directory.
// Data sources (in order): opensheet.elk.sh -> localStorage cache -> bundled data/programs.json.

const SHEET_ID = "1rTdR5qV-WM9T-K7QJOl33s7bobL4Z5pAvyiWqrKuFJ4";
const SHEET_TAB = "R.E.A.C.H.";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(SHEET_TAB)}`;
const FALLBACK_URL = "data/programs.json";
const CACHE_KEY = "reach:data:v2";

const TRUE_VALUES = new Set(["TRUE", "YES", "Y", "1"]);
const NA_VALUES = new Set(["", "NA", "N/A", "FALSE", "NO", "N", "0"]);
const MULTI_FIELDS = ["focus", "population", "eligibility"];

const state = {
  data: [],
  filtered: [],
  search: "",
  category: "All",
  selected: { population: new Set(), eligibility: new Set(), barrier_level: new Set() },
  toggles: { crisis: false, open24: false, walkin: false, lowbarrier: false },
  sort: "alpha", // alpha | category
};

const els = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  banner: document.getElementById("banner"),
  categoryRail: document.getElementById("categoryRail"),
  populationChips: document.getElementById("populationChips"),
  eligibilityChips: document.getElementById("eligibilityChips"),
  barrierChips: document.getElementById("barrierChips"),
  filterPanel: document.getElementById("filterPanel"),
  filtersBtn: document.getElementById("filtersBtn"),
  sortBtn: document.getElementById("sortBtn"),
  clearBtn: document.getElementById("clearBtn"),
  resultCount: document.getElementById("resultCount"),
  refresh: document.getElementById("refresh"),
  dataStatus: document.getElementById("dataStatus"),
  overlay: document.getElementById("detailOverlay"),
  detailBody: document.getElementById("detailBody"),
  detailClose: document.getElementById("detailClose"),
};

// ---------- Data loading ----------

async function loadData({ forceRemote = false } = {}) {
  if (!forceRemote) {
    const cached = readCache();
    if (cached) {
      applyData(cached.data, { source: `cached ${timeAgo(cached.ts)}` });
    }
  }

  try {
    const res = await fetch(SHEET_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`sheet responded ${res.status}`);
    const json = await res.json();
    const normalized = json.map(normalize);
    applyData(normalized, { source: "live from Google Sheet" });
    writeCache(normalized);
    clearBanner();
    return;
  } catch (err) {
    console.warn("Sheet fetch failed:", err);
  }

  if (state.data.length === 0) {
    try {
      const res = await fetch(FALLBACK_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`fallback responded ${res.status}`);
      const json = await res.json();
      const normalized = json.map(normalize);
      applyData(normalized, { source: "offline snapshot" });
      showBanner("Live sheet unreachable — showing committed snapshot.", "warn");
      return;
    } catch (err) {
      console.error("Fallback load failed:", err);
      showBanner("Could not load program data. Check your connection and retry.", "error");
    }
  } else {
    showBanner("Live sheet unreachable — showing your last cached copy.", "warn");
  }
}

function applyData(data, { source }) {
  state.data = data;
  els.dataStatus.textContent = source ? `Data: ${source}` : "";
  buildFilters();
  buildCategoryRail();
  applyFilters();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore quota errors
  }
}

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------- Normalization ----------

function normalize(row) {
  return {
    program_name: (row["Program Name"] || "").trim(),
    program_id: (row["Program ID"] || "").trim(),
    category: (row["Category"] || "").trim() || "Uncategorized",
    focus: splitList(row["Focus"]),
    address: clean(row["Address"]),
    website: clean(row["Website"]),
    phone: clean(row["Phone Number"]),
    barrier_level: normalizeBarrier(row["Barrier Level to Services"]),
    crisis_prepared: isTrue(row["Crisis Prepared"]),
    eligibility: splitList(row["Eligibility"]),
    walk_ins: normalizeTri(row["Walk-ins Accepted"]),
    intake_method: clean(row["Intake Method"]),
    intake_requirements: clean(row["Intake Requirements"]),
    population: splitList(row["Population"]),
    hours_24: normalizeTri(row["24 Hours"]),
    summary: clean(row["Summary"]),
    date_verified: clean(row["Date Verified"]),
  };
}

function clean(v) {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  if (NA_VALUES.has(s.toUpperCase())) return "";
  return s;
}

function splitList(v) {
  const s = (v ?? "").toString().trim();
  if (!s || NA_VALUES.has(s.toUpperCase())) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function isTrue(v) {
  return TRUE_VALUES.has((v ?? "").toString().trim().toUpperCase());
}

function normalizeTri(v) {
  const s = (v ?? "").toString().trim().toUpperCase();
  if (TRUE_VALUES.has(s)) return "Yes";
  if (s === "LIMITED") return "Limited";
  if (s === "NA" || s === "N/A" || s === "") return "";
  if (s === "FALSE" || s === "NO" || s === "N" || s === "0") return "No";
  return v;
}

function normalizeBarrier(v) {
  const s = (v ?? "").toString().trim();
  if (!s || NA_VALUES.has(s.toUpperCase())) return "";
  return s;
}

// ---------- Filters ----------

function uniqueValues(key) {
  const out = new Set();
  state.data.forEach((row) => {
    const v = row[key];
    if (Array.isArray(v)) v.forEach((x) => x && out.add(x));
    else if (v) out.add(v);
  });
  return [...out].sort((a, b) => a.localeCompare(b));
}

function buildCategoryRail() {
  const cats = ["All", ...uniqueValues("category")];
  els.categoryRail.innerHTML = "";
  cats.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (c === state.category ? " active" : "");
    btn.textContent = c;
    btn.dataset.category = c;
    btn.addEventListener("click", () => {
      state.category = c;
      buildCategoryRail();
      applyFilters();
    });
    els.categoryRail.appendChild(btn);
  });
}

function buildFilters() {
  renderChipGroup(els.populationChips, uniqueValues("population"), state.selected.population, "population");
  renderChipGroup(els.eligibilityChips, uniqueValues("eligibility"), state.selected.eligibility, "eligibility");
  renderChipGroup(els.barrierChips, uniqueValues("barrier_level"), state.selected.barrier_level, "barrier_level");
}

function renderChipGroup(container, values, selectedSet, key) {
  container.innerHTML = "";
  if (!values.length) {
    container.innerHTML = `<span class="muted">No options</span>`;
    return;
  }
  values.forEach((v) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (selectedSet.has(v) ? " active" : "");
    btn.textContent = v;
    btn.addEventListener("click", () => {
      if (selectedSet.has(v)) selectedSet.delete(v);
      else selectedSet.add(v);
      btn.classList.toggle("active");
      applyFilters();
    });
    container.appendChild(btn);
  });
}

function applyFilters() {
  const q = state.search.trim().toLowerCase();
  const cat = state.category;
  const { population, eligibility, barrier_level } = state.selected;
  const { crisis, open24, walkin, lowbarrier } = state.toggles;

  state.filtered = state.data.filter((row) => {
    if (cat !== "All" && row.category !== cat) return false;
    if (crisis && !row.crisis_prepared) return false;
    if (open24 && row.hours_24 !== "Yes") return false;
    if (walkin && row.walk_ins === "No") return false;
    if (lowbarrier && !/low/i.test(row.barrier_level)) return false;

    if (population.size && !anyIn(row.population, population)) return false;
    if (eligibility.size && !anyIn(row.eligibility, eligibility)) return false;
    if (barrier_level.size && !barrier_level.has(row.barrier_level)) return false;

    if (q) {
      const hay = [
        row.program_name,
        row.program_id,
        row.category,
        row.summary,
        row.intake_method,
        row.intake_requirements,
        ...row.focus,
        ...row.population,
        ...row.eligibility,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  sortData();
  render();
  updateClearButton();
}

function anyIn(values, selectedSet) {
  if (!values || !values.length) return false;
  return values.some((v) => selectedSet.has(v));
}

function sortData() {
  const by = state.sort;
  const cmpName = (a, b) => a.program_name.localeCompare(b.program_name);
  if (by === "alpha") {
    state.filtered.sort(cmpName);
  } else if (by === "category") {
    state.filtered.sort((a, b) => a.category.localeCompare(b.category) || cmpName(a, b));
  }
}

// ---------- Render ----------

function render() {
  const total = state.data.length;
  const shown = state.filtered.length;
  els.resultCount.textContent = shown
    ? `Showing ${shown} of ${total} programs`
    : `No programs match your filters (of ${total})`;

  els.grid.innerHTML = "";
  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No programs match your filters. Try clearing some.";
    els.grid.appendChild(empty);
    return;
  }

  state.filtered.forEach((row, idx) => {
    els.grid.appendChild(cardEl(row, idx));
  });
}

function cardEl(row, idx) {
  const el = document.createElement("article");
  el.className = "card";
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${row.program_name}, ${row.category}`);
  el.addEventListener("click", (ev) => {
    if (ev.target.closest("a")) return;
    openDetail(row);
  });
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      openDetail(row);
    }
  });

  el.appendChild(node("span", "category", row.category));
  el.appendChild(node("h3", null, row.program_name));
  if (row.summary) el.appendChild(node("p", "summary", row.summary));

  const badges = document.createElement("div");
  badges.className = "badges";
  if (row.barrier_level) {
    badges.appendChild(badge(`${row.barrier_level} barrier`, `barrier-${barrierClass(row.barrier_level)}`));
  }
  if (row.crisis_prepared) badges.appendChild(badge("Crisis ready"));
  if (row.hours_24 === "Yes") badges.appendChild(badge("24 hours"));
  if (row.walk_ins === "Yes") badges.appendChild(badge("Walk-ins"));
  else if (row.walk_ins === "Limited") badges.appendChild(badge("Walk-ins: limited"));
  if (badges.children.length) el.appendChild(badges);

  const actions = document.createElement("div");
  actions.className = "actions";
  if (row.phone) actions.appendChild(link(`tel:${row.phone.replace(/[^0-9+]/g, "")}`, "Call"));
  if (row.website) actions.appendChild(link(row.website, "Website", true));
  if (row.address) actions.appendChild(link(mapUrl(row.address), "Map", true));
  if (actions.children.length) el.appendChild(actions);

  return el;
}

function badge(text, extra) {
  const b = document.createElement("span");
  b.className = "badge" + (extra ? " " + extra : "");
  b.textContent = text;
  return b;
}

function barrierClass(value) {
  const v = value.toLowerCase();
  if (v.includes("low-med")) return "lowmed";
  if (v.includes("low")) return "low";
  if (v.includes("high")) return "high";
  if (v.includes("medium")) return "medium";
  return "";
}

function link(href, text, external) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  if (external) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  a.addEventListener("click", (e) => e.stopPropagation());
  return a;
}

function mapUrl(addr) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

// ---------- Detail sheet ----------

function openDetail(row) {
  els.detailBody.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "detail";

  const cat = node("div", "category-line", row.category);
  const h2 = node("h2", null, row.program_name);
  h2.id = "detailTitle";
  wrap.appendChild(cat);
  wrap.appendChild(h2);

  const badges = document.createElement("div");
  badges.className = "badges";
  if (row.barrier_level) badges.appendChild(badge(`${row.barrier_level} barrier`, `barrier-${barrierClass(row.barrier_level)}`));
  if (row.crisis_prepared) badges.appendChild(badge("Crisis ready"));
  if (row.hours_24 === "Yes") badges.appendChild(badge("24 hours"));
  if (row.walk_ins === "Yes") badges.appendChild(badge("Walk-ins"));
  else if (row.walk_ins === "Limited") badges.appendChild(badge("Walk-ins: limited"));
  if (badges.children.length) wrap.appendChild(badges);

  if (row.summary) wrap.appendChild(node("p", "summary", row.summary));

  const actions = document.createElement("div");
  actions.className = "actions";
  if (row.phone) {
    actions.appendChild(link(`tel:${row.phone.replace(/[^0-9+]/g, "")}`, `Call ${row.phone}`));
  }
  if (row.website) actions.appendChild(makeSecondary(link(row.website, "Visit website", true)));
  if (row.address) actions.appendChild(makeSecondary(link(mapUrl(row.address), "Open map", true)));
  if (actions.children.length) wrap.appendChild(actions);

  const dl = document.createElement("dl");
  const fields = [
    ["Address", row.address],
    ["Phone", row.phone],
    ["Website", row.website && linkify(row.website)],
    ["Focus", row.focus.join(", ")],
    ["Population", row.population.join(", ")],
    ["Eligibility", row.eligibility.join(", ")],
    ["Intake method", row.intake_method],
    ["Intake requirements", row.intake_requirements],
    ["Walk-ins accepted", row.walk_ins],
    ["Open 24 hours", row.hours_24],
    ["Barrier level", row.barrier_level],
    ["Crisis prepared", row.crisis_prepared ? "Yes" : ""],
    ["Program ID", row.program_id],
    ["Date verified", row.date_verified],
  ];
  fields.forEach(([label, value]) => {
    if (!value) return;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  wrap.appendChild(dl);

  els.detailBody.appendChild(wrap);
  els.overlay.hidden = false;
  document.body.style.overflow = "hidden";
  els.detailClose.focus();
}

function makeSecondary(a) {
  a.classList.add("secondary");
  return a;
}

function linkify(url) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = url;
  return a;
}

function closeDetail() {
  els.overlay.hidden = true;
  document.body.style.overflow = "";
}

// ---------- Banner ----------

function showBanner(msg, level) {
  els.banner.hidden = false;
  els.banner.textContent = msg;
  els.banner.className = "banner" + (level === "error" ? " error" : "");
}
function clearBanner() {
  els.banner.hidden = true;
  els.banner.textContent = "";
}

// ---------- Clear filters ----------

function hasAnyFilters() {
  return (
    state.search ||
    state.category !== "All" ||
    Object.values(state.toggles).some(Boolean) ||
    state.selected.population.size ||
    state.selected.eligibility.size ||
    state.selected.barrier_level.size
  );
}

function updateClearButton() {
  els.clearBtn.hidden = !hasAnyFilters();
}

function clearAll() {
  state.search = "";
  els.search.value = "";
  state.category = "All";
  state.selected.population.clear();
  state.selected.eligibility.clear();
  state.selected.barrier_level.clear();
  Object.keys(state.toggles).forEach((k) => (state.toggles[k] = false));
  document.querySelectorAll(".quick-filters .chip.toggle.active").forEach((el) => el.classList.remove("active"));
  buildCategoryRail();
  buildFilters();
  applyFilters();
}

// ---------- Wire up ----------

els.search.addEventListener("input", (e) => {
  state.search = e.target.value;
  applyFilters();
});

els.filtersBtn.addEventListener("click", () => {
  const next = !els.filterPanel.hidden;
  els.filterPanel.hidden = next;
  els.filtersBtn.classList.toggle("active", !next);
});

els.sortBtn.addEventListener("click", () => {
  state.sort = state.sort === "alpha" ? "category" : "alpha";
  els.sortBtn.textContent = state.sort === "alpha" ? "Sort: A–Z" : "Sort: Category";
  applyFilters();
});

els.clearBtn.addEventListener("click", clearAll);

document.querySelectorAll(".quick-filters .chip.toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.toggle;
    state.toggles[key] = !state.toggles[key];
    btn.classList.toggle("active", state.toggles[key]);
    applyFilters();
  });
});

els.refresh.addEventListener("click", () => {
  loadData({ forceRemote: true });
});

els.detailClose.addEventListener("click", closeDetail);
els.overlay.addEventListener("click", (e) => {
  if (e.target === els.overlay) closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.overlay.hidden) closeDetail();
});

loadData();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
