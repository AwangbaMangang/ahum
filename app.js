// app.js - Updated single-file (replace your existing app.js with this)
// Combined and polished:
// - Load dictionary.json (with fallback)
// - Large-text micro-batch replacement (preserves punctuation/spacing)
// - Upload/download dictionary (.json/.csv)
// - Progress bar + last-synced (localStorage)
// - Automatic service-worker registration + "Update available" button
// - Online/offline status handling
// - Small UX improvements (Ctrl/Cmd+Enter trigger, non-blocking alerts via small toast)

/* ====================
   Minimal Toast (non-blocking user messages)
   ==================== */
(function createToast() {
  if (document.getElementById("app-toast")) return;
  const t = document.createElement("div");
  t.id = "app-toast";
  t.style.position = "fixed";
  t.style.right = "16px";
  t.style.bottom = "16px";
  t.style.minWidth = "160px";
  t.style.maxWidth = "320px";
  t.style.zIndex = 9999;
  t.style.fontFamily = "Arial, sans-serif";
  document.body.appendChild(t);
})();
function showToast(msg, timeout = 3000) {
  const container = document.getElementById("app-toast");
  if (!container) return alert(msg);
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.background = "#222";
  el.style.color = "#fff";
  el.style.padding = "8px 12px";
  el.style.borderRadius = "8px";
  el.style.marginTop = "8px";
  el.style.boxShadow = "0 6px 18px rgba(0,0,0,0.2)";
  el.style.opacity = "0";
  el.style.transition = "opacity 180ms ease, transform 180ms ease";
  el.style.transform = "translateY(6px)";
  container.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translateY(0)"; });
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

/* ====================
   Elements & State
   ==================== */
const state = {
  dictionary: {},
  lastSynced: localStorage.getItem("lastSynced") || "never",
};

const el = {
  lastSynced: document.getElementById("last-synced"),
  inputText: document.getElementById("inputText"),
  outputText: document.getElementById("outputText"),
  replaceBtn: document.getElementById("replaceBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  uploadDictionary: document.getElementById("uploadDictionary"),
  downloadDictionary: document.getElementById("downloadDictionary"),
  progressBar: document.getElementById("progressBar")
};

if (el.lastSynced) el.lastSynced.innerText = "Last synced: " + state.lastSynced;

/* ====================
   Load default dictionary
   ==================== */
function loadDefaultDictionary() {
  return fetch("dictionary.json")
    .then(res => {
      if (!res.ok) throw new Error("dictionary.json not found");
      return res.json();
    })
    .then(data => {
      if (typeof data === "object" && data !== null) {
        state.dictionary = data;
        console.log("Default dictionary loaded:", Object.keys(state.dictionary).length, "entries");
      } else {
        console.warn("dictionary.json root isn't an object");
        state.dictionary = {};
      }
    })
    .catch(err => {
      console.warn("Could not load dictionary.json:", err);
      state.dictionary = {};
    });
}
loadDefaultDictionary();

/* ====================
   Helpers
   ==================== */
function safeTrim(v) { return typeof v === "string" ? v.trim() : v; }
function setLastSyncedNow() {
  state.lastSynced = new Date().toLocaleString();
  localStorage.setItem("lastSynced", state.lastSynced);
  if (el.lastSynced) el.lastSynced.innerText = "Last synced: " + state.lastSynced;
}

/* ====================
   Replacement routine (micro-batched for responsiveness)
   ==================== */
function replaceLargeText(inputText, onProgress) {
  if (!inputText) return Promise.resolve("");
  // tokenization - keep separators (whitespace + punctuation)
  const tokens = inputText.split(/(\s+|[.,!?;:"'()—–\-\[\]{}])/u);
  const total = tokens.length;
  const BATCH = 2000; // tune if needed
  let i = 0;
  const out = new Array(total);

  return new Promise((resolve) => {
    function processBatch() {
      const end = Math.min(i + BATCH, total);
      for (; i < end; i++) {
        const token = tokens[i];
        const key = safeTrim(token);
        if (key && Object.prototype.hasOwnProperty.call(state.dictionary, key)) {
          // Replace only the matched key inside token (preserve punctuation/spacing)
          out[i] = token.replace(key, state.dictionary[key]);
        } else {
          out[i] = token;
        }
      }
      if (onProgress) onProgress(Math.round((i / total) * 100));
      if (i < total) {
        // schedule next chunk
        setTimeout(processBatch, 0);
      } else {
        resolve(out.join(""));
      }
    }
    processBatch();
  });
}

if (el.replaceBtn) {
  el.replaceBtn.addEventListener("click", async () => {
    const text = (el.inputText && el.inputText.value) || "";
    if (!text) {
      if (el.outputText) el.outputText.value = "";
      showToast("Input is empty");
      return;
    }
    if (el.progressBar) el.progressBar.style.width = "0%";
    try {
      const result = await replaceLargeText(text, (p) => { if (el.progressBar) el.progressBar.style.width = p + "%"; });
      if (el.outputText) el.outputText.value = result;
      setLastSyncedNow();
      if (el.progressBar) {
        el.progressBar.style.width = "100%";
        setTimeout(() => { if (el.progressBar) el.progressBar.style.width = "0%"; }, 700);
      }
      showToast("Replacement completed");
    } catch (err) {
      console.error("Replacement error:", err);
      showToast("Error during replacement");
    }
  });
}

/* ====================
   Refresh / Clear
   ==================== */
if (el.refreshBtn) {
  el.refreshBtn.addEventListener("click", () => {
    if (el.inputText) el.inputText.value = "";
    if (el.outputText) el.outputText.value = "";
    if (el.progressBar) el.progressBar.style.width = "0%";
  });
}

/* ====================
   Upload custom dictionary (.json or .csv)
   ==================== */
if (el.uploadDictionary) {
  el.uploadDictionary.addEventListener("change", (evt) => {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        if (file.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (typeof parsed === "object" && parsed !== null) {
            state.dictionary = parsed;
            showToast(`JSON dictionary loaded (${Object.keys(state.dictionary).length} entries)`);
          } else throw new Error("JSON root must be an object");
        } else if (file.name.toLowerCase().endsWith(".csv")) {
          const rows = text.split(/\r?\n/);
          const map = {};
          rows.forEach(r => {
            if (!r.trim()) return;
            const parts = r.split(",");
            const key = parts.shift();
            const value = parts.join(",");
            if (key && value) map[key.trim()] = value.trim();
          });
          state.dictionary = map;
          showToast(`CSV dictionary loaded (${Object.keys(state.dictionary).length} entries)`);
        } else {
          showToast("Unsupported file type (use .json or .csv)");
        }
      } catch (err) {
        console.error("Failed to parse dictionary:", err);
        showToast("Failed to load dictionary (see console)");
      }
    };
    reader.readAsText(file);
  });
}

/* ====================
   Download current dictionary
   ==================== */
if (el.downloadDictionary) {
  el.downloadDictionary.addEventListener("click", () => {
    try {
      const blob = new Blob([JSON.stringify(state.dictionary, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dictionary.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Dictionary downloaded");
    } catch (err) {
      console.error("Download error:", err);
      showToast("Could not download dictionary");
    }
  });
}

/* ====================
   Service Worker registration & update flow
   ==================== */
(function serviceWorkerFlow() {
  // create status area and update button
  let swStatus = document.getElementById("sw-status");
  if (!swStatus) {
    swStatus = document.createElement("small");
    swStatus.id = "sw-status";
    swStatus.style.display = "block";
    swStatus.style.marginTop = "6px";
    swStatus.style.fontSize = "0.78rem";
    swStatus.style.color = "#cfcfcf";
    const header = document.querySelector("header");
    if (header) header.appendChild(swStatus);
  }

  // update button (created when update available)
  let swUpdateBtn = null;
  function createUpdateBtn() {
    if (swUpdateBtn) return swUpdateBtn;
    swUpdateBtn = document.createElement("button");
    swUpdateBtn.id = "sw-update-btn";
    swUpdateBtn.textContent = "Refresh to update";
    swUpdateBtn.style.marginLeft = "8px";
    swUpdateBtn.style.padding = "6px 10px";
    swUpdateBtn.style.fontSize = "0.85rem";
    swUpdateBtn.style.borderRadius = "8px";
    swUpdateBtn.style.cursor = "pointer";
    swUpdateBtn.style.background = "#ff9800";
    swUpdateBtn.style.color = "#111";
    swUpdateBtn.addEventListener("click", () => {
      // Try to message waiting worker to skipWaiting
      if (!navigator.serviceWorker) return location.reload(true);
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          if (reg.waiting) {
            // send a message the SW file can respond to (if implemented)
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }).finally(() => setTimeout(() => location.reload(true), 600));
    });
    swStatus.parentNode && swStatus.parentNode.appendChild(swUpdateBtn);
    return swUpdateBtn;
  }

  function setStatus(txt) {
    if (swStatus) swStatus.textContent = txt;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => {
          console.log("SW registered with scope:", reg.scope);
          // initial status
          if (!navigator.onLine) setStatus("Offline (cached)");
          else setStatus("Online — Offline ready");

          // When updatefound fires
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // update available
                  setStatus("Update available");
                  createUpdateBtn();
                } else {
                  // first install
                  setStatus("Offline ready");
                }
              }
            });
          });

          // If a waiting worker already present -> show update button
          if (reg.waiting) {
            setStatus("Update available");
            createUpdateBtn();
          }
        })
        .catch(err => {
          console.warn("SW registration failed:", err);
          setStatus("Service worker not available");
        });

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (evt) => {
        const data = evt.data || {};
        // If SW confirms skip waiting or activated, reload
        if (data && data.type === 'RELOAD_PAGE') {
          setTimeout(() => location.reload(true), 300);
        }
      });
    });
  } else {
    setStatus("Service worker unsupported");
  }

  // Online/offline state reflection
  function updateOnlineStatus() {
    const online = navigator.onLine;
    if (!online) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) setStatus("Offline (cached)");
      else setStatus("Offline");
    } else {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) setStatus("Online — Offline ready");
      else setStatus("Online");
    }
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();
})();

/* ====================
   Convenience: Ctrl/Cmd + Enter to Replace
   ==================== */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (el.replaceBtn) el.replaceBtn.click();
  }
});
