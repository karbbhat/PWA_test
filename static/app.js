/* ================================
 * Spinner / Toast / History
 * ================================ */

const spinner = document.getElementById("spinner");
const spinnerLabel = document.getElementById("spinner-label");
function showSpinner(msg) {
  spinnerLabel.textContent = msg || "Processing…";
  spinner.style.display = "flex";
}
function hideSpinner() {
  spinner.style.display = "none";
}

// Toast
let toastTimer = null;
function showToast(message, type = "success", ttlMs = 4500) {
  const toast = document.getElementById("toast");
  const content = document.getElementById("toast-content");
  toast.classList.remove("toast-success","toast-error");
  toast.classList.add(type === "error" ? "toast-error" : "toast-success");
  content.textContent = message;
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = "none"; }, ttlMs);
}

// Command history
const historyArr = []; // newest-first
const bell = document.getElementById("history-bell");
const badge = document.getElementById("history-badge");
const panel = document.getElementById("history-panel");
const list = document.getElementById("history-list");
const clearBtn = document.getElementById("history-clear");

function pushHistory(entry) { // {ts, op, trackID, status, message}
  historyArr.unshift(entry);
  if (historyArr.length > 10) historyArr.pop();
  renderHistory();
}
function renderHistory() {
  list.innerHTML = "";
  if (historyArr.length === 0) {
    badge.hidden = true;
    const li = document.createElement("li");
    li.innerHTML = "No recent terminal results";
    list.appendChild(li);
    return;
  }
  badge.hidden = false;
  badge.textContent = String(historyArr.length);
  historyArr.forEach(h => {
    const li = document.createElement("li");
    const statusCls = (String(h.status).toLowerCase() === "completed") ? "history-ok" : "history-fail";
    li.className = statusCls;
    li.innerHTML = `
      <div class="h-ts">${h.ts}</div>
      <div class="h-op">${escapeHtml(h.op)} • ${escapeHtml(h.status)}</div>
      <div class="h-id">#${escapeHtml(h.trackID || "-")}</div>
      <div class="h-msg">${escapeHtml(h.message || "")}</div>
    `;
    list.appendChild(li);
  });
}
function escapeHtml(str="") {
  return String(str).replace(/[&<>"']/g, s => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]
  ));
}
function truncate(s, n){ return (s && s.length > n) ? s.slice(0, n - 1) + "…" : s; }

bell.addEventListener("click", () => {
  const hidden = panel.hasAttribute("hidden");
  if (hidden) panel.removeAttribute("hidden"); else panel.setAttribute("hidden","true");
});
clearBtn.addEventListener("click", () => { historyArr.splice(0, historyArr.length); renderHistory(); });

/* ================================
 * Global state
 * ================================ */

// File cards: selected file paths
const selectedFilePaths = new Set();

// Targets from Load Attributes: array of { target, position }
let loadAttribTargets = [];

// User-chosen targets (when Full Load is OFF)
const selectedTargets = new Set();

// CONFIG-CHECK: Map LRM name -> <card element>
const targetCardIndex = new Map();

// LOAD: Map label (LRM or CODE) -> <card element>
const loadTargetCardIndex = new Map();

// Optional: LRM name -> module code (e.g., "proc6"), learned after Config Check
const targetCodeByLRM = new Map();

/* ================================
 * Badges / Enable flow
 * ================================ */

const statusBadge = document.getElementById("status-badge");
function setBadge(text, cls) {
  statusBadge.textContent = text;
  statusBadge.className = "hw-badge " + cls;
}
function enableWorkflow(on) {
  document.getElementById("stage-btn").disabled           = !on;
  document.getElementById("btn-loadable-files").disabled  = !on;
  document.getElementById("btn-load-attributes").disabled = !on;
  document.getElementById("btn-config-check").disabled    = true;  // until attributes arrive
  document.getElementById("btn-load").disabled            = true;  // until config check completes
}

/* ================================
 * APPLY CONFIG
 * ================================ */

document.getElementById("config-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const host = document.getElementById("cfg-host").value.trim();
  const ssl_mode = document.getElementById("cfg-ssl").value;
  if (!host) { alert("Enter ADG Host"); return; }
  try {
    showSpinner("Applying configuration…");
    const r = await fetch("/api/config", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({host, ssl_mode})
    });
    const j = await r.json();
    if (j.status === "ok") {
      setBadge("mTLS ready", "hw-badge-green");
      enableWorkflow(true);
    } else {
      setBadge("mTLS error", "hw-badge-gray");
      enableWorkflow(false);
      alert(j.error);
    }
  } catch (err) {
    alert(err);
  } finally { hideSpinner(); }
});

/* ================================
 * STAGE FILE
 * ================================ */

document.getElementById("stage-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  showSpinner("Staging file…");
  try {
    const r = await fetch("/api/stage", { method: "POST", body: fd });
    const j = await r.json();
    if (r.ok) showToast("Staged Successfully", "success");
    else showToast("Stage failed", "error");
  } finally { hideSpinner(); }
});

/* ================================
 * LOADABLE FILES (grid of 5 per row) + selection
 * ================================ */

document.getElementById("btn-loadable-files").addEventListener("click", async () => {
  showSpinner("Fetching EPIC loadable files…");
  try {
    const r = await fetch("/api/get-loadable-files");
    const j = await r.json();
    const tid = j.json && j.json.trackID;
    if (!tid) { hideSpinner(); return alert("No trackID returned"); }

    await pollUntil(tid, (match) => {
      const files = match.loadableFilesList || [];
      renderLoadableFilesGrid(files);
    });
  } finally { hideSpinner(); }
});

function renderLoadableFilesGrid(files) {
  const grid = document.getElementById("loadable-files-grid");
  grid.innerHTML = "";

  if (!files || files.length === 0) {
    const empty = document.createElement("div");
    empty.className = "lf-empty";
    empty.textContent = "No loadable files found.";
    grid.appendChild(empty);
    return;
  }

  files.forEach(f => {
    const loc = f.FilePath || "";
    const card = document.createElement("div");
    card.className = "lf-item";
    card.setAttribute("data-path", loc);

    const title = document.createElement("div");
    title.className = "lf-title";
    title.textContent = f.FileDescription || f.FilePartNumber || (loc ? String(loc).split("/").pop() : "File");

    const meta = document.createElement("div");
    meta.className = "lf-meta";
    const src = f.FileMediaSource || "";
    const area = (f.Area || "").trim();
    const pn = f.FilePartNumber || "";
    meta.innerHTML = `
      <div><strong>Path:</strong> ${escapeHtml(loc)}</div>
      <div><strong>Source:</strong> ${escapeHtml(src)}${area ? ` · ${escapeHtml(area)}` : ""}</div>
      ${pn ? `<div><strong>PN:</strong> ${escapeHtml(pn)}</div>` : ""}
    `;

    // toggle selection
    const toggle = (explicit) => {
      const willSelect = (explicit !== undefined) ? explicit : !card.classList.contains("selected");
      if (willSelect) { card.classList.add("selected"); selectedFilePaths.add(loc); }
      else { card.classList.remove("selected"); selectedFilePaths.delete(loc); }
    };
    card.addEventListener("click", () => toggle());

    // restore selection if re-rendered
    if (selectedFilePaths.has(loc)) card.classList.add("selected");

    card.appendChild(title);
    card.appendChild(meta);
    grid.appendChild(card);
  });
}

/* ================================
 * LOAD ATTRIBUTES (uses selected file cards) -> render TARGETS in Config Check card
 * ================================ */

document.getElementById("btn-load-attributes").addEventListener("click", async () => {
  const selectedFiles = Array.from(selectedFilePaths);
  if (!selectedFiles.length) return alert("Select at least one file card.");

  showSpinner("Fetching Load Attributes…");
  try {
    const r = await fetch("/api/get-load-attributes", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ protocol:"EPIC", filePaths:selectedFiles })
    });
    const j = await r.json();
    const tid = j.json && j.json.trackID;
    if (!tid) { hideSpinner(); return alert("No trackID returned"); }

    await pollUntil(tid, (match) => {
      const la = match.loadAttribResults || [];
      const merged = [];
      la.forEach(x => (x.targets || []).forEach(t => merged.push(t)));
      loadAttribTargets = merged;

      // Render in Config Check card only
      renderTargets();

      // Enable Config Check
      document.getElementById("btn-config-check").disabled = false;
    });
  } finally { hideSpinner(); }
});

/* ================================
 * CONFIG CHECK (separate section) + Full Load toggle
 * ================================ */

document.getElementById("full-load").addEventListener("change", () => {
  renderTargets(); // shows "Full Load selected" or the target grid
});

document.getElementById("btn-config-check").addEventListener("click", async () => {
  const passcode = document.getElementById("passcode").value || null;
  const fullLoad = document.getElementById("full-load").checked;
  const tinfo = fullLoad ? [] : collectSelectedTargets(); // [{target, position:""}]

  showSpinner("Running Config Check…");
  try {
    const r = await fetch("/api/config-check", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ passcode, targets: tinfo.map(t => t.target) })
    });
    if (!r.ok) { showToast(`ConfigCheck request failed: HTTP ${r.status}`, "error"); return; }
    const j = await r.json();
    const tid = j.json && j.json.trackID;
    if (!tid) return alert("No trackID for Config Check");

    await pollUntil(tid, (match) => {
      // Table view (separate results card)
      renderConfigResults(match);

      // Ensure target cards exist in CONFIG card (even for Full Load), then update
      ensureTargetCardsFromConfigResults(match);   // CONFIG card only
      updateTargetCardsWithConfigResults(match);   // CONFIG card only

      // Enable Load (Step 4)
      document.getElementById("btn-load").disabled = false;
    });
  } finally { hideSpinner(); }
});

/* ---- CONFIG: targets grid & painters (CONFIG CARD ONLY) ---- */

function renderTargets() {
  const root = document.getElementById("config-targets-panel");
  root.innerHTML = "";

  const full = document.getElementById("full-load").checked;
  if (full) {
    // Only this short text when full-load is on
    const msg = document.createElement("div");
    msg.className = "tgt-placeholder";
    msg.textContent = "Full Load selected";
    root.appendChild(msg);
    return;
  }

  if (!loadAttribTargets || loadAttribTargets.length === 0) {
    const msg = document.createElement("div");
    msg.className = "tgt-placeholder";
    msg.textContent = "No targets loaded yet.";
    root.appendChild(msg);
    return;
  }

  // Unique, sorted LRM names
  const moduleSet = new Set();
  loadAttribTargets.forEach(t => { if (t && t.target) moduleSet.add(String(t.target)); });
  const modules = Array.from(moduleSet).sort();

  const grid = document.createElement("div");
  grid.className = "tgt-grid";      // shared grid style (max 5 per row)
  targetCardIndex.clear();

  modules.forEach(lrm => {
    const card = document.createElement("div");
    card.className = "tgt-card";   // shared card style
    card.dataset.lrm = lrm;

    const title = document.createElement("div");
    title.className = "tgt-title";
    title.textContent = lrm;

    const st = document.createElement("div");
    st.className = "tgt-status";

    const msg = document.createElement("div");
    msg.className = "tgt-msg";

    // click-to-select (when Full Load is OFF)
    const toggle = (force) => {
      const willSelect = (force !== undefined) ? force : !card.classList.contains("selected");
      if (willSelect) { card.classList.add("selected"); selectedTargets.add(lrm); }
      else { card.classList.remove("selected"); selectedTargets.delete(lrm); }
    };
    card.addEventListener("click", () => toggle());

    if (selectedTargets.has(lrm)) card.classList.add("selected");

    card.appendChild(title);
    card.appendChild(st);
    card.appendChild(msg);
    grid.appendChild(card);

    targetCardIndex.set(lrm, card);
  });

  root.appendChild(grid);
}

function ensureTargetCardsFromConfigResults(match) {
  const results = (match && Array.isArray(match.configResults)) ? match.configResults : [];
  if (!results.length) return;

  const lrms = results.map(r => String(r.LRMName || "")).filter(Boolean);
  const root = document.getElementById("config-targets-panel");

  if (root.querySelector(".tgt-grid")) {
    // Ensure we have cards for all LRMs
    const grid = root.querySelector(".tgt-grid");
    lrms.forEach(lrm => {
      if (!targetCardIndex.has(lrm)) {
        const card = document.createElement("div");
        card.className = "tgt-card";
        card.dataset.lrm = lrm;
        card.innerHTML = `
          <div class="tgt-title">${escapeHtml(lrm)}</div>
          <div class="tgt-status"></div>
          <div class="tgt-msg"></div>
        `;
        grid.appendChild(card);
        targetCardIndex.set(lrm, card);
      }
    });
    return;
  }

  // Build fresh grid from results (e.g., Full Load had hidden the grid earlier)
  const grid = document.createElement("div");
  grid.className = "tgt-grid";
  targetCardIndex.clear();

  lrms.forEach(lrm => {
    const card = document.createElement("div");
    card.className = "tgt-card";
    card.dataset.lrm = lrm;
    card.innerHTML = `
      <div class="tgt-title">${escapeHtml(lrm)}</div>
      <div class="tgt-status"></div>
      <div class="tgt-msg"></div>
    `;
    grid.appendChild(card);
    targetCardIndex.set(lrm, card);
  });

  root.innerHTML = ""; // remove any placeholder like "Full Load selected"
  root.appendChild(grid);
}

function updateTargetCardsWithConfigResults(match) {
  const results = match && match.configResults ? match.configResults : [];
  if (!results.length || targetCardIndex.size === 0) return;

  targetCodeByLRM.clear();

  results.forEach(r => {
    const lrm = String(r.LRMName || "");
    const card = targetCardIndex.get(lrm);
    if (!card) return;

    card.classList.remove("ok", "fail");

    const statusText = String(r.StatusOfConfigCheck || "");
    const isOk = statusText.toLowerCase() === "completed";
    const msg = String(r.message || "");

    card.classList.add(isOk ? "ok" : "fail");

    const stEl = card.querySelector(".tgt-status");
    const msgEl = card.querySelector(".tgt-msg");
    if (stEl) stEl.textContent = `Config Check: ${statusText}`;
    if (msgEl) msgEl.textContent = msg;

    if (r.SelectedTarget) {
      targetCodeByLRM.set(lrm, String(r.SelectedTarget).toLowerCase()); // e.g., "proc6"
    }
  });
}

/* ================================
 * LOAD (separate section)
 * ================================ */

document.getElementById("btn-load").addEventListener("click", async () => {
  const selectedFiles = Array.from(selectedFilePaths);
  if (!selectedFiles.length) return alert("Select files before load");

  const fullLoad = document.getElementById("full-load").checked;
  const tinfo = fullLoad ? [] : collectSelectedTargets(); // [{target, position:""}]

  showSpinner("Starting Load…");
  try {
    const r = await fetch("/api/load", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ protocol:"EPIC", filePaths:selectedFiles, targets:tinfo })
    });
    if (!r.ok) { showToast(`Load request failed: HTTP ${r.status}`, "error"); return; }
    const j = await r.json();
    const tid = j.json && j.json.trackID;
    if (!tid) return alert("No trackID returned");

    await pollUntil(tid, (match) => {
      // Update the Load Results table (summary)
      renderLoadResults(match);

      // IMPORTANT: Build & paint LOAD CARDS in the LOAD section ONLY
      ensureLoadCardsFromLoadResults(match);   // LOAD card only
      updateLoadCardsWithLoadResults(match);   // LOAD card only
    });
  } finally { hideSpinner(); }
});

/* ---- LOAD: targets/status grid & painters (LOAD CARD ONLY) ---- */

// Build the load cards grid in the LOAD section from load results
function ensureLoadCardsFromLoadResults(match) {
  const arr = match && Array.isArray(match.percent_Complete) ? match.percent_Complete : [];
  if (!arr.length) return;

  const root = document.getElementById("load-targets-panel");
  // If we already have a grid, clear and rebuild (fresh run)
  root.innerHTML = "";

  // Try map module codes to LRMs learned at config-check time for nicer titles
  const labels = arr.map(m => {
    const code = String(m.module || "").toLowerCase();
    let lrm = null;
    for (const [name, c] of targetCodeByLRM.entries()) {
      if (c === code) { lrm = name; break; }
    }
    return lrm || code.toUpperCase(); // fallback to CODE as label
  });

  const grid = document.createElement("div");
  grid.className = "tgt-grid";  // reuse same grid style (max 5 per row)
  loadTargetCardIndex.clear();

  labels.forEach(lbl => {
    const card = document.createElement("div");
    card.className = "tgt-card";    // same card visuals, but we don't attach selection handlers here
    card.dataset.label = lbl;
    card.innerHTML = `
      <div class="tgt-title">${escapeHtml(lbl)}</div>
      <div class="tgt-status"></div>
      <div class="tgt-msg"></div>
    `;
    grid.appendChild(card);
    loadTargetCardIndex.set(lbl, card);
  });

  root.appendChild(grid);
}

// Paint per-LRU load statuses onto the LOAD cards only
function updateLoadCardsWithLoadResults(match) {
  const arr = match && Array.isArray(match.percent_Complete) ? match.percent_Complete : [];
  if (!arr.length || loadTargetCardIndex.size === 0) return;

  arr.forEach(m => {
    const code = String(m.module || "").toLowerCase();   // e.g., "proc6"
    const status = String(m.status || "");
    const msg = String(m.message || "");
    const pct = Number(m.percent_Complete || 0);

    // Lookup preferred label via mapping from config check (LRM), else CODE
    let label = null;
    for (const [lrm, c] of targetCodeByLRM.entries()) {
      if (c === code) { label = lrm; break; }
    }
    if (!label) label = code.toUpperCase();

    const card = loadTargetCardIndex.get(label);
    if (!card) return;

    card.classList.remove("ok", "fail");
    const isOk = status.toLowerCase() === "completed";
    card.classList.add(isOk ? "ok" : "fail");

    const stEl = card.querySelector(".tgt-status");
    const msgEl = card.querySelector(".tgt-msg");
    if (stEl) stEl.textContent = `Load: ${status} (${pct}%)`;
    if (msgEl) msgEl.textContent = msg;
  });
}

/* ================================
 * Results tables (already in your HTML)
 * ================================ */

function renderConfigResults(match) {
  const root = document.getElementById("config-results");
  if (!match) { root.textContent = "No results"; return; }

  const {
    message = "",
    partNumber = "",
    filename = "",
    OverallEstimatedLoadTime = 0,
    totalPercentComplete = 0,
    configResults = []
  } = match;

  const hdr = document.createElement("div");
  hdr.className = "summary";
  hdr.innerHTML = `
    <div><strong>Part Number:</strong> ${escapeHtml(String(partNumber))}</div>
    <div><strong>File:</strong> ${escapeHtml(String(filename))}</div>
    <div><strong>Overall ETA (min):</strong> ${Number(OverallEstimatedLoadTime)}</div>
    <div><strong>Overall % Complete:</strong> ${Number(totalPercentComplete)}%</div>
    ${message ? `<div class="warn"><strong>Message:</strong> ${escapeHtml(message)}</div>` : ""}
  `;

  const table = document.createElement("table");
  table.className = "grid";
  table.innerHTML = `
    <thead>
      <tr>
        <th>LRU</th>
        <th>Selected Target</th>
        <th>Status</th>
        <th>Message</th>
        <th>Estimated Load Time</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  (configResults || []).forEach(r => {
    const tr = document.createElement("tr");
    const status = String(r.StatusOfConfigCheck || "").toLowerCase();
    tr.className = (status === "completed") ? "row-ok" : (status === "failed" ? "row-fail" : "");
    tr.innerHTML = `
      <td>${escapeHtml(String(r.LRMName || ""))}</td>
      <td>${escapeHtml(String(r.SelectedTarget || ""))}</td>
      <td>${escapeHtml(String(r.StatusOfConfigCheck || ""))}</td>
      <td>${escapeHtml(String(r.message || ""))}</td>
      <td>${Number(r.EstimatedLoadTime || 0)}</td>
    `;
    tbody.appendChild(tr);
  });

  root.innerHTML = "";
  root.appendChild(hdr);
  root.appendChild(table);
}

function renderLoadResults(match) {
  const root = document.getElementById("load-results");
  if (!match) { root.textContent = "No results"; return; }

  const {
    status = "",
    message = "",
    fileName = "",
    partNumber = "",
    totalPercentComplete = 0,
    startDate = null,
    endDate = null,
    queuedDate = null,
    percent_Complete = []
  } = match;

  const fmtTs = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "-");

  const hdr = document.createElement("div");
  hdr.className = "summary";
  hdr.innerHTML = `
    <div><strong>Status:</strong> ${escapeHtml(String(status))}</div>
    <div><strong>Part Number:</strong> ${escapeHtml(String(partNumber))}</div>
    <div><strong>File:</strong> ${escapeHtml(String(fileName))}</div>
    <div><strong>Queued:</strong> ${fmtTs(queuedDate)}</div>
    <div><strong>Start:</strong> ${fmtTs(startDate)}</div>
    <div><strong>End:</strong> ${fmtTs(endDate)}</div>
    <div><strong>Overall % Complete:</strong> ${Number(totalPercentComplete)}%</div>
    ${message ? `<div class="warn"><strong>Message:</strong> ${escapeHtml(message)}</div>` : ""}
  `;

  const table = document.createElement("table");
  table.className = "grid";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Module</th>
        <th>Status</th>
        <th>%</th>
        <th>Estimated Time</th>
        <th>Time Remaining</th>
        <th>Current File</th>
        <th>Message</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  (percent_Complete || []).forEach(r => {
    const st = String(r.status || "").toLowerCase();
    const tr = document.createElement("tr");
    tr.className = (st === "completed") ? "row-ok" : (st === "failed" ? "row-fail" : "");
    tr.innerHTML = `
      <td>${escapeHtml(String(r.module || ""))}</td>
      <td>${escapeHtml(String(r.status || ""))}</td>
      <td>${Number(r.percent_Complete || 0)}%</td>
      <td>${Number(r.estimatedTime || 0)}</td>
      <td>${Number(r.timeRemaining || 0)}</td>
      <td>${escapeHtml(String(r.currentFile || ""))}</td>
      <td>${escapeHtml(String(r.message || ""))}</td>
    `;
    tbody.appendChild(tr);
  });

  root.innerHTML = "";
  root.appendChild(hdr);
  root.appendChild(table);
}

/* ================================
 * Poll helper (terminal callback)
 * ================================ */

async function pollUntil(tid, onTerminal) {
  while (true) {
    await new Promise(res => setTimeout(res, 2000));
    const r = await fetch(`/api/poll?trackID=${encodeURIComponent(tid)}`);
    const j = await r.json();
    const match = j.match || null;
    if (!match) continue;

    const st = String(match.status || "").toLowerCase();
    if (st === "completed" || st === "failed" || st === "deleted") {
      const op = match.pollType || inferOpFromMatch(match);
      const msg = Array.isArray(match.message) ? JSON.stringify(match.message) : (match.message || "");

      pushHistory({
        ts: new Date().toLocaleString(),
        op,
        trackID: String(match.trackID || ""),
        status: match.status,
        message: msg || ""
      });

      if (st === "completed") showToast(`${op} completed`, "success");
      else {
        const t = msg ? `: ${truncate(msg, 140)}` : "";
        showToast(`${op} ${match.status}${t}`, "error");
      }
      onTerminal && onTerminal(match);
      break;
    }
  }
}

// Heuristic op label for history/toast
function inferOpFromMatch(m) {
  if (!m) return "operation";
  if (m.pollType) return m.pollType;
  if (m.loadableFilesList) return "loadableFilesList";
  if (m.loadAttribResults) return "loadAttributes";
  if (m.configResults) return "configCheck";
  if (m.percent_Complete || m.totalPercentComplete) return "loadToAvionics";
  return "operation";
}

/* ================================
 * Misc helpers
 * ================================ */

function collectSelectedTargets() {
  return Array.from(selectedTargets).map(t => ({ target: t, position: "" }));
}

// Initial history render
renderHistory();
