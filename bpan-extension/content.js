// BPAN Research Notes — Content Script
// Injects sidebar + floating "Create Note" button on text selection

(function () {
  "use strict";

  // Will be overridden from storage if set via popup
  let API_BASE = "https://bpan-app.vercel.app";
  let sidebarOpen = false;
  let currentPaperId = null;
  let sidebarEl = null;
  let fabEl = null;
  let notes = [];

  // ─── Floating "Create Note" Button ───────────────────────────────

  function createFab() {
    const fab = document.createElement("div");
    fab.id = "bpan-fab";
    fab.innerHTML = `<span class="bpan-fab-icon">✨</span> Create Note`;
    fab.style.display = "none";
    document.body.appendChild(fab);

    fab.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    fab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length > 5) {
        openSidebar();
        processHighlight(text);
        sel.removeAllRanges();
        fab.style.display = "none";
      }
    });

    return fab;
  }

  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (text.length > 5) {
        if (!fabEl) fabEl = createFab();
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        fabEl.style.left =
          Math.min(rect.left + rect.width / 2 - 65, window.innerWidth - 170) + "px";
        fabEl.style.top = Math.max(rect.top + window.scrollY - 48, 5) + "px";
        fabEl.style.display = "flex";
      }
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target && (e.target.id === "bpan-fab" || e.target.closest("#bpan-fab")))
      return;
    if (fabEl) fabEl.style.display = "none";
  });

  // ─── Sidebar ─────────────────────────────────────────────────────

  function createSidebar() {
    const sidebar = document.createElement("div");
    sidebar.id = "bpan-sidebar";
    sidebar.innerHTML = `
      <div class="bpan-header">
        <div class="bpan-logo">
          <span class="bpan-logo-icon">📝</span>
          <span>BPAN Notes</span>
        </div>
        <button id="bpan-close" class="bpan-icon-btn" title="Close">✕</button>
      </div>

      <div id="bpan-paper-info" class="bpan-section">
        <div id="bpan-paper-status" class="bpan-status">
          Click the extension icon to link a paper, or highlight text to start.
        </div>
      </div>

      <div id="bpan-pending" class="bpan-section" style="display:none;">
        <div class="bpan-pending-label">
          <span class="bpan-sparkle">✨</span> AI is writing your note...
        </div>
        <div id="bpan-pending-highlight" class="bpan-highlight-box"></div>
        <div id="bpan-pending-spinner" class="bpan-spinner"></div>
        <div id="bpan-pending-result" style="display:none;">
          <textarea id="bpan-pending-content" class="bpan-textarea" rows="4"></textarea>
          <div id="bpan-pending-meta" class="bpan-meta"></div>
          <div class="bpan-actions">
            <button id="bpan-save-note" class="bpan-btn bpan-btn-primary">Save note</button>
            <button id="bpan-discard-note" class="bpan-btn bpan-btn-ghost">✕</button>
          </div>
        </div>
      </div>

      <div id="bpan-notes-list" class="bpan-section">
        <div class="bpan-section-title">Saved Notes</div>
        <div id="bpan-notes-container"></div>
      </div>
    `;
    document.body.appendChild(sidebar);

    // Close button
    sidebar.querySelector("#bpan-close").addEventListener("click", closeSidebar);

    // Save note
    sidebar.querySelector("#bpan-save-note").addEventListener("click", saveNote);

    // Discard
    sidebar.querySelector("#bpan-discard-note").addEventListener("click", () => {
      hidePending();
    });

    return sidebar;
  }

  function openSidebar() {
    if (!sidebarEl) sidebarEl = createSidebar();
    sidebarEl.classList.add("bpan-sidebar-open");
    sidebarOpen = true;
    loadPaperAndNotes();
  }

  function closeSidebar() {
    if (sidebarEl) sidebarEl.classList.remove("bpan-sidebar-open");
    sidebarOpen = false;
  }

  function toggleSidebar() {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
  }

  // ─── Paper Detection & Notes Loading ──────────────────────────────

  async function loadPaperAndNotes() {
    const config = await getConfig();
    if (!config.token) {
      setPaperStatus("Log in via the extension popup first.");
      return;
    }

    if (currentPaperId) {
      await loadNotes(config);
      return;
    }

    // Try to detect paper from the current page URL
    const pmid = detectPMID();
    const doi = detectDOI();

    if (pmid || doi) {
      setPaperStatus("Detecting paper...");
      try {
        const res = await fetch(`${API_BASE}/api/extension/find-paper`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({ pmid, doi, url: window.location.href }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.paperId) {
            currentPaperId = data.paperId;
            setPaperStatus(`📄 ${data.title || "Paper linked"}`);
            await loadNotes(config);
            return;
          }
        }
      } catch (err) {
        console.warn("BPAN: paper detection failed", err);
      }
    }

    setPaperStatus(
      "Paper not detected. Highlight text to create notes — they'll be linked when you save the paper in the app."
    );
  }

  async function loadNotes(config) {
    if (!currentPaperId || !config.token) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/extension/notes?paperId=${currentPaperId}`,
        {
          headers: { Authorization: `Bearer ${config.token}` },
        }
      );
      if (res.ok) {
        notes = await res.json();
        renderNotes();
      }
    } catch (err) {
      console.warn("BPAN: failed to load notes", err);
    }
  }

  // ─── AI Processing ───────────────────────────────────────────────

  let pendingHighlight = null;
  let pendingResult = null;

  async function processHighlight(text) {
    pendingHighlight = text;
    pendingResult = null;
    showPending(text);

    const config = await getConfig();
    if (!config.token) {
      setPendingError("Log in via the extension popup first.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/note-assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          highlight: text,
          paperTitle: document.title,
          paperAbstract: "",
          authors: [],
          journal: "",
          pubDate: "",
        }),
      });

      if (!res.ok) throw new Error("AI processing failed");
      const data = await res.json();
      pendingResult = data;
      showPendingResult(data);
    } catch (err) {
      setPendingError("Failed to process: " + err.message);
    }
  }

  async function saveNote() {
    if (!pendingHighlight || !pendingResult) return;
    const config = await getConfig();
    if (!config.token) return;

    const content = sidebarEl.querySelector("#bpan-pending-content").value;

    try {
      const btn = sidebarEl.querySelector("#bpan-save-note");
      btn.textContent = "Saving...";
      btn.disabled = true;

      const res = await fetch(`${API_BASE}/api/extension/save-note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          paperId: currentPaperId,
          content,
          highlightText: pendingHighlight,
          noteType: pendingResult.noteType || "general",
          tags: pendingResult.suggestedTags || [],
          pageUrl: window.location.href,
          pageTitle: document.title,
        }),
      });

      if (res.ok) {
        const saved = await res.json();
        if (saved.paperId) currentPaperId = saved.paperId;
        notes.unshift(saved.note || { content, highlight_text: pendingHighlight, note_type: pendingResult.noteType, tags: pendingResult.suggestedTags || [] });
        renderNotes();
        hidePending();
      }
    } catch (err) {
      console.error("BPAN: save failed", err);
    }
  }

  // ─── UI Helpers ──────────────────────────────────────────────────

  function setPaperStatus(html) {
    if (!sidebarEl) return;
    sidebarEl.querySelector("#bpan-paper-status").innerHTML = html;
  }

  function showPending(text) {
    if (!sidebarEl) return;
    const section = sidebarEl.querySelector("#bpan-pending");
    section.style.display = "block";
    sidebarEl.querySelector("#bpan-pending-highlight").textContent = `"${
      text.length > 200 ? text.slice(0, 200) + "..." : text
    }"`;
    sidebarEl.querySelector("#bpan-pending-spinner").style.display = "block";
    sidebarEl.querySelector("#bpan-pending-result").style.display = "none";
    sidebarEl.querySelector(".bpan-pending-label").innerHTML =
      '<span class="bpan-sparkle">✨</span> AI is writing your note...';
  }

  function showPendingResult(data) {
    if (!sidebarEl) return;
    sidebarEl.querySelector("#bpan-pending-spinner").style.display = "none";
    sidebarEl.querySelector("#bpan-pending-result").style.display = "block";
    sidebarEl.querySelector("#bpan-pending-content").value = data.content || "";
    sidebarEl.querySelector(".bpan-pending-label").innerHTML =
      '<span class="bpan-sparkle">✨</span> AI-generated note';

    const metaEl = sidebarEl.querySelector("#bpan-pending-meta");
    let metaHtml = `<span class="bpan-tag bpan-tag-${data.noteType || "general"}">${data.noteType || "general"}</span>`;
    if (data.suggestedTags) {
      data.suggestedTags.forEach((tag) => {
        metaHtml += `<span class="bpan-tag">${tag}</span>`;
      });
    }
    metaEl.innerHTML = metaHtml;

    const btn = sidebarEl.querySelector("#bpan-save-note");
    btn.textContent = "Save note";
    btn.disabled = false;
  }

  function setPendingError(msg) {
    if (!sidebarEl) return;
    sidebarEl.querySelector("#bpan-pending-spinner").style.display = "none";
    sidebarEl.querySelector(".bpan-pending-label").innerHTML =
      `<span style="color:#ef4444">${msg}</span>`;
  }

  function hidePending() {
    if (!sidebarEl) return;
    sidebarEl.querySelector("#bpan-pending").style.display = "none";
    pendingHighlight = null;
    pendingResult = null;
  }

  function renderNotes() {
    if (!sidebarEl) return;
    const container = sidebarEl.querySelector("#bpan-notes-container");
    if (notes.length === 0) {
      container.innerHTML =
        '<div class="bpan-empty">No notes yet. Highlight text in the paper to get started.</div>';
      return;
    }
    container.innerHTML = notes
      .map(
        (note) => `
      <div class="bpan-note-card">
        ${
          note.highlight_text
            ? `<div class="bpan-note-highlight">"${
                note.highlight_text.length > 100
                  ? note.highlight_text.slice(0, 100) + "..."
                  : note.highlight_text
              }"</div>`
            : ""
        }
        <div class="bpan-note-content">${escapeHtml(note.content)}</div>
        <div class="bpan-note-meta">
          <span class="bpan-tag bpan-tag-${note.note_type || "general"}">${note.note_type || "general"}</span>
          ${(note.tags || []).map((t) => `<span class="bpan-tag">${escapeHtml(t)}</span>`).join("")}
        </div>
      </div>
    `
      )
      .join("");
  }

  // ─── URL Detection ───────────────────────────────────────────────

  function detectPMID() {
    const url = window.location.href;
    // PubMed URL pattern
    const match = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
    if (match) return match[1];
    // PMC pattern
    const pmcMatch = url.match(/pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC(\d+)/);
    if (pmcMatch) return null; // PMC ID, not PMID
    return null;
  }

  function detectDOI() {
    const url = window.location.href;
    // DOI in URL
    const match = url.match(/doi\.org\/(10\.\d{4,}\/[^\s&?#]+)/);
    if (match) return match[1];
    // Check meta tags
    const metaDoi =
      document.querySelector('meta[name="citation_doi"]')?.content ||
      document.querySelector('meta[name="DC.identifier"]')?.content ||
      document.querySelector('meta[name="dc.identifier"]')?.content;
    if (metaDoi) {
      const doiMatch = metaDoi.match(/(10\.\d{4,}\/[^\s]+)/);
      if (doiMatch) return doiMatch[1];
    }
    return null;
  }

  // ─── Storage / Config ────────────────────────────────────────────

  function getConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["bpan_token", "bpan_user_email", "bpan_api_base"], (data) => {
        if (data.bpan_api_base) API_BASE = data.bpan_api_base;
        resolve({
          token: data.bpan_token || null,
          email: data.bpan_user_email || null,
        });
      });
    });
  }

  // ─── Utilities ───────────────────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Message Handling (from popup or background) ─────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle-sidebar") toggleSidebar();
    if (msg.type === "logged-in") {
      if (sidebarOpen) loadPaperAndNotes();
    }
  });
})();
