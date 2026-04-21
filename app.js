const SHEET_URL = "https://opensheet.elk.sh/1rTdR5qV-WM9T-K7QJOl33s7bobL4Z5pAvyiWqrKuFJ4/Sheet1";

let data = [];
let filtered = [];

const grid = document.getElementById("grid");

const searchInput = document.getElementById("search");
const barrierSelect = document.getElementById("barrier");
const populationSelect = document.getElementById("population");
const eligibilitySelect = document.getElementById("eligibility");
const sortSelect = document.getElementById("sort");

async function fetchData() {
  try {
    const res = await fetch(SHEET_URL);
    const json = await res.json();
    data = json.map(normalize);
    initFilters();
    applyFilters();
  } catch {
    loadOffline();
  }
}

function normalize(row) {
  return {
    program_name: row["Program Name"],
    program_id: row["Program ID"],
    category: row["Category"],
    focus: row["Focus"],
    address: row["Address"],
    website: row["Website"],
    phone: row["Phone Number"],
    barrier_level: row["Barrier Level"],
    crisis_prepared: row["Crisis Prepared"],
    eligibility: row["Eligibility"],
    walk_ins: row["Walk-ins Accepted"],
    intake_method: row["Intake Method"],
    intake_requirements: row["Intake Requirements"],
    population: row["Population"],
    hours_24: row["24 Hours"],
    summary: row["Summary"],
    date_verified: row["Date Verified"]
  };
}

function uniqueValues(key) {
  return [...new Set(data.map(d => d[key]).filter(Boolean))];
}

function initFilters() {
  fillSelect(barrierSelect, uniqueValues("barrier_level"));
  fillSelect(populationSelect, uniqueValues("population"));
  fillSelect(eligibilitySelect, uniqueValues("eligibility"));
}

function fillSelect(select, values) {
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function getSelected(select) {
  return Array.from(select.selectedOptions).map(o => o.value);
}

function applyFilters() {
  const q = searchInput.value.toLowerCase();
  const barrier = getSelected(barrierSelect);
  const population = getSelected(populationSelect);
  const eligibility = getSelected(eligibilitySelect);

  filtered = data.filter(item => {
    const matchesSearch =
      item.program_name?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.focus?.toLowerCase().includes(q) ||
      item.summary?.toLowerCase().includes(q);

    const matchesBarrier =
      !barrier.length || barrier.includes(item.barrier_level);

    const matchesPopulation =
      !population.length || population.includes(item.population);

    const matchesEligibility =
      !eligibility.length || eligibility.includes(item.eligibility);

    return matchesSearch && matchesBarrier && matchesPopulation && matchesEligibility;
  });

  sortData();
  render();
}

function sortData() {
  if (sortSelect.value === "alpha") {
    filtered.sort((a, b) => a.program_name.localeCompare(b.program_name));
  } else {
    filtered.sort((a, b) => a.category.localeCompare(b.category));
  }
}

function render() {
  grid.innerHTML = "";
  filtered.forEach(item => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${item.program_name}</h3>
      <p>${item.summary || ""}</p>
      <div class="actions">
        ${item.phone ? `<a href="tel:${item.phone}">Call</a>` : ""}
        ${item.website ? `<a href="${item.website}" target="_blank">Website</a>` : ""}
        ${item.address ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}" target="_blank">Map</a>` : ""}
      </div>
    `;

    grid.appendChild(div);
  });
}

function loadOffline() {
  const cached = localStorage.getItem("data");
  if (cached) {
    data = JSON.parse(cached);
    initFilters();
    applyFilters();
  }
}

searchInput.addEventListener("input", applyFilters);
barrierSelect.addEventListener("change", applyFilters);
populationSelect.addEventListener("change", applyFilters);
eligibilitySelect.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

fetchData("https://opensheet.elk.sh/1rTdR5qV-WM9T-K7QJOl33s7bobL4Z5pAvyiWqrKuFJ4/R.E.A.C.H.");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}
