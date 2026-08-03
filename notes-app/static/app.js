(() => {
  "use strict";

  const treeEl = document.getElementById("tree");
  const contentEl = document.getElementById("content");
  const reviewBtn = document.getElementById("reviewBtn");
  const reviewCountEl = document.getElementById("reviewCount");
  const toastEl = document.getElementById("toast");

  let CONTENT = [];       // chapters from content.json
  let NOTES = {};         // id -> {notes, questions[]}
  let NODES = {};         // id -> node descriptor
  let expanded = new Set();
  let selectedId = null;
  const saveTimers = {};

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1400);
  }

  function emptyEntry() {
    return { notes: "", questions: [] };
  }

  function getEntry(id) {
    if (!NOTES[id]) NOTES[id] = emptyEntry();
    return NOTES[id];
  }

  function persist(id) {
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, entry: NOTES[id] }),
    }).catch(() => showToast("Save failed — is the server running?"));
  }

  function scheduleSave(id, statusEl) {
    if (statusEl) { statusEl.textContent = "Saving…"; statusEl.classList.add("saving"); }
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(() => {
      persist(id);
      if (statusEl) {
        statusEl.textContent = "Saved";
        statusEl.classList.remove("saving");
        setTimeout(() => { if (statusEl.textContent === "Saved") statusEl.textContent = ""; }, 1500);
      }
      refreshBadges();
    }, 600);
  }

  // ---------- Build flat node index ----------
  function buildIndex() {
    NODES = {};
    for (const ch of CONTENT) {
      const cid = `c${ch.num}`;
      NODES[cid] = {
        id: cid, type: "chapter", title: `Chapter ${ch.num}. ${ch.title}`,
        shortTitle: `${ch.num}. ${ch.title}`, page: ch.page,
        breadcrumb: [], chapter: ch, children: [],
      };
      ch.sections.forEach((sec, sIdx) => {
        const sid = `${cid}-s${sIdx}`;
        NODES[cid].children.push(sid);
        NODES[sid] = {
          id: sid, type: "section", title: sec.title, shortTitle: sec.title, page: sec.page,
          breadcrumb: [NODES[cid].shortTitle], chapter: ch, section: sec, children: [],
        };
        sec.subsections.forEach((sub, subIdx) => {
          const subId = `${sid}-${subIdx}`;
          NODES[sid].children.push(subId);
          NODES[subId] = {
            id: subId, type: "subsection", title: sub.title, shortTitle: sub.title, page: sub.page,
            breadcrumb: [NODES[cid].shortTitle, sec.title], chapter: ch, section: sec, children: [],
          };
        });
      });
    }
  }

  function countOpenQuestions(id) {
    const e = NOTES[id];
    if (!e) return 0;
    return e.questions.filter(q => q.status === "open").length;
  }

  function nodeHasNotes(id) {
    const e = NOTES[id];
    return !!(e && e.notes && e.notes.trim());
  }

  function allOpenQuestionsCount() {
    let n = 0;
    for (const id in NOTES) n += countOpenQuestions(id);
    return n;
  }

  // ---------- Sidebar tree ----------
  function buildTree() {
    treeEl.innerHTML = "";
    for (const ch of CONTENT) {
      const cid = `c${ch.num}`;
      treeEl.appendChild(renderChapterNode(cid));
    }
    refreshBadges();
  }

  function badgesHTML(id) {
    const openQ = countOpenQuestions(id);
    const hasNotes = nodeHasNotes(id);
    let html = '<span class="node-badges">';
    if (hasNotes) html += '<span class="badge-dot" title="Has notes"></span>';
    if (openQ > 0) html += `<span class="badge-q" title="${openQ} open question(s)">${openQ}</span>`;
    html += "</span>";
    return html;
  }

  function renderChapterNode(cid) {
    const node = NODES[cid];
    const wrap = document.createElement("div");
    wrap.className = "chapter-node";

    const row = document.createElement("div");
    row.className = "node-row chapter-row";
    row.dataset.id = cid;
    const hasChildren = node.children.length > 0;
    row.innerHTML = `
      <span class="caret ${hasChildren ? "" : "spacer"} ${expanded.has(cid) ? "open" : ""}">▶</span>
      <span class="node-label">${escapeHtml(node.shortTitle)}</span>
      ${badgesHTML(cid)}
    `;
    row.querySelector(".caret").addEventListener("click", (e) => { e.stopPropagation(); toggleExpand(cid); });
    row.addEventListener("click", () => { selectNode(cid); if (hasChildren) setExpand(cid, true); });
    wrap.appendChild(row);

    const list = document.createElement("div");
    list.className = "section-list" + (expanded.has(cid) ? " open" : "");
    list.dataset.parent = cid;
    node.children.forEach(sid => list.appendChild(renderSectionNode(sid)));
    wrap.appendChild(list);

    return wrap;
  }

  function renderSectionNode(sid) {
    const node = NODES[sid];
    const wrap = document.createElement("div");

    const row = document.createElement("div");
    row.className = "node-row section-row";
    row.dataset.id = sid;
    const hasChildren = node.children.length > 0;
    row.innerHTML = `
      <span class="caret ${hasChildren ? "" : "spacer"} ${expanded.has(sid) ? "open" : ""}">▶</span>
      <span class="node-label">${escapeHtml(node.shortTitle)}</span>
      ${badgesHTML(sid)}
    `;
    row.querySelector(".caret").addEventListener("click", (e) => { e.stopPropagation(); toggleExpand(sid); });
    row.addEventListener("click", () => { selectNode(sid); if (hasChildren) setExpand(sid, true); });
    wrap.appendChild(row);

    const list = document.createElement("div");
    list.className = "subsection-list" + (expanded.has(sid) ? " open" : "");
    list.dataset.parent = sid;
    node.children.forEach(subId => list.appendChild(renderSubNode(subId)));
    wrap.appendChild(list);

    return wrap;
  }

  function renderSubNode(subId) {
    const node = NODES[subId];
    const row = document.createElement("div");
    row.className = "node-row sub-row";
    row.dataset.id = subId;
    row.innerHTML = `
      <span class="caret spacer">▶</span>
      <span class="node-label">${escapeHtml(node.shortTitle)}</span>
      ${badgesHTML(subId)}
    `;
    row.addEventListener("click", () => selectNode(subId));
    return row;
  }

  function toggleExpand(id) { setExpand(id, !expanded.has(id)); }
  function setExpand(id, open) {
    if (open) expanded.add(id); else expanded.delete(id);
    const row = treeEl.querySelector(`.node-row[data-id="${id}"]`);
    if (row) row.querySelector(".caret")?.classList.toggle("open", open);
    const list = treeEl.querySelector(`[data-parent="${id}"]`);
    if (list) list.classList.toggle("open", open);
  }

  function expandAncestors(id) {
    const node = NODES[id];
    if (!node) return;
    if (node.type === "subsection") {
      const sid = id.split("-").slice(0, 2).join("-");
      const cid = id.split("-")[0];
      setExpand(cid, true);
      setExpand(sid, true);
    } else if (node.type === "section") {
      const cid = id.split("-")[0];
      setExpand(cid, true);
    }
  }

  function refreshBadges() {
    treeEl.querySelectorAll(".node-row").forEach(row => {
      const id = row.dataset.id;
      const b = row.querySelector(".node-badges");
      if (b) b.outerHTML = badgesHTML(id);
    });
    const total = allOpenQuestionsCount();
    reviewCountEl.textContent = total;
    reviewCountEl.classList.toggle("zero", total === 0);
  }

  function selectNode(id) {
    selectedId = id;
    reviewBtn.classList.remove("active");
    treeEl.querySelectorAll(".node-row.selected").forEach(r => r.classList.remove("selected"));
    const row = treeEl.querySelector(`.node-row[data-id="${id}"]`);
    if (row) row.classList.add("selected");
    expandAncestors(id);
    renderContent(id);
  }

  // ---------- Content pane ----------
  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderContent(id) {
    const node = NODES[id];
    if (!node) return;
    const entry = getEntry(id);

    const crumb = node.breadcrumb.length
      ? node.breadcrumb.join(" › ") + (node.type !== "chapter" ? " ›" : "")
      : "";

    let html = `
      <div class="breadcrumb">${escapeHtml(crumb)}</div>
      <h1 class="page-title">${escapeHtml(node.title)}</h1>
      <div class="page-meta">Book page ${escapeHtml(String(node.page))}${node.type !== "chapter" ? ` · ${node.type}` : ""}</div>
    `;

    if (node.type === "chapter") {
      html += `
        <div class="panel">
          <h2>Chapter summary</h2>
          <div class="book-content">${node.chapter.summary_html || "<p>No summary available.</p>"}</div>
        </div>
      `;
      if (node.chapter.resources_html) {
        html += `
          <div class="panel res-panel">
            <h2>Curated resources <button class="panel-toggle" id="resToggle">show</button></h2>
            <div class="book-content" id="resBody" style="display:none">${node.chapter.resources_html}</div>
          </div>
        `;
      }
    }

    html += `
      <div class="panel">
        <h2>Your notes</h2>
        <textarea class="notes-box" id="notesBox" placeholder="Write what stood out, what confused you, or how this connects to something else you know…">${escapeHtml(entry.notes)}</textarea>
        <div class="save-status" id="notesSaveStatus"></div>
      </div>

      <div class="panel">
        <h2>Questions</h2>
        <div class="questions-list" id="questionsList"></div>
        <div class="add-question-row">
          <input type="text" id="newQuestionInput" placeholder="Ask something you want to come back to…">
          <button id="addQuestionBtn">Add</button>
        </div>
      </div>
    `;

    contentEl.innerHTML = html;

    const resToggle = document.getElementById("resToggle");
    if (resToggle) {
      resToggle.addEventListener("click", () => {
        const body = document.getElementById("resBody");
        const showing = body.style.display !== "none";
        body.style.display = showing ? "none" : "block";
        resToggle.textContent = showing ? "show" : "hide";
      });
    }

    const notesBox = document.getElementById("notesBox");
    const statusEl = document.getElementById("notesSaveStatus");
    notesBox.addEventListener("input", () => {
      entry.notes = notesBox.value;
      scheduleSave(id, statusEl);
    });

    renderQuestions(id, document.getElementById("questionsList"));

    document.getElementById("addQuestionBtn").addEventListener("click", () => addQuestion(id));
    document.getElementById("newQuestionInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") addQuestion(id);
    });
  }

  function addQuestion(id) {
    const input = document.getElementById("newQuestionInput");
    const text = input.value.trim();
    if (!text) return;
    const entry = getEntry(id);
    entry.questions.push({
      id: "q" + Date.now() + Math.random().toString(36).slice(2, 6),
      text, answer: "", status: "open", created: new Date().toISOString(),
    });
    input.value = "";
    persist(id);
    refreshBadges();
    renderQuestions(id, document.getElementById("questionsList"));
  }

  function questionCard(nodeId, q, onChange) {
    const card = document.createElement("div");
    card.className = "question-card";
    card.innerHTML = `
      <div class="question-head">
        <span class="q-status ${q.status}">${q.status === "open" ? "Open" : "Answered"}</span>
        <span class="q-text">${escapeHtml(q.text)}</span>
        <button class="q-del" title="Delete question">✕</button>
      </div>
      <textarea class="q-answer" placeholder="Write your answer once you find it…">${escapeHtml(q.answer)}</textarea>
      <div class="q-actions">
        <button class="toggle-status">${q.status === "open" ? "Mark answered" : "Reopen"}</button>
      </div>
    `;
    const answerBox = card.querySelector(".q-answer");
    answerBox.addEventListener("input", () => {
      q.answer = answerBox.value;
      scheduleSave(nodeId);
    });
    card.querySelector(".toggle-status").addEventListener("click", () => {
      q.status = q.status === "open" ? "answered" : "open";
      persist(nodeId);
      refreshBadges();
      onChange();
    });
    card.querySelector(".q-del").addEventListener("click", () => {
      if (!confirm("Delete this question and its answer?")) return;
      const entry = getEntry(nodeId);
      entry.questions = entry.questions.filter(x => x.id !== q.id);
      persist(nodeId);
      refreshBadges();
      onChange();
    });
    return card;
  }

  function renderQuestions(nodeId, container) {
    const entry = getEntry(nodeId);
    container.innerHTML = "";
    if (!entry.questions.length) {
      container.innerHTML = '<div class="no-questions">No questions yet.</div>';
      return;
    }
    const sorted = [...entry.questions].sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1));
    sorted.forEach(q => container.appendChild(questionCard(nodeId, q, () => renderQuestions(nodeId, container))));
  }

  // ---------- Review mode ----------
  function renderReview() {
    selectedId = null;
    treeEl.querySelectorAll(".node-row.selected").forEach(r => r.classList.remove("selected"));
    reviewBtn.classList.add("active");

    let html = `
      <div class="breadcrumb">Whole book</div>
      <h1 class="page-title">Review open questions</h1>
      <div class="page-meta">Everything you flagged as unanswered, grouped by chapter</div>
    `;
    contentEl.innerHTML = html;

    let any = false;
    for (const ch of CONTENT) {
      const cid = `c${ch.num}`;
      const ids = [cid, ...NODES[cid].children, ...NODES[cid].children.flatMap(sid => NODES[sid].children)];
      const openItems = ids
        .map(nid => ({ nid, q: (NOTES[nid]?.questions || []).filter(q => q.status === "open") }))
        .filter(x => x.q.length);
      if (!openItems.length) continue;
      any = true;

      const group = document.createElement("div");
      group.className = "review-group";
      const title = document.createElement("div");
      title.className = "review-group-title";
      title.textContent = `Chapter ${ch.num}. ${ch.title}`;
      title.addEventListener("click", () => selectNode(cid));
      group.appendChild(title);

      const list = document.createElement("div");
      list.className = "questions-list";
      openItems.forEach(({ nid, q }) => {
        q.forEach(item => {
          const card = questionCard(nid, item, () => renderReview());
          const label = document.createElement("div");
          label.style.fontSize = "0.72rem";
          label.style.color = "var(--text-faint)";
          label.style.marginBottom = "4px";
          label.textContent = NODES[nid].breadcrumb.length
            ? NODES[nid].breadcrumb.concat(NODES[nid].shortTitle).join(" › ")
            : NODES[nid].shortTitle;
          const holder = document.createElement("div");
          holder.appendChild(label);
          holder.appendChild(card);
          list.appendChild(holder);
        });
      });
      group.appendChild(list);
      contentEl.appendChild(group);
    }

    if (!any) {
      const done = document.createElement("div");
      done.className = "review-done";
      done.textContent = "No open questions right now. Nice work — go find something to be curious about.";
      contentEl.appendChild(done);
    }
  }

  reviewBtn.addEventListener("click", renderReview);

  // ---------- Boot ----------
  async function boot() {
    const [content, notes] = await Promise.all([
      fetch("/content.json").then(r => r.json()),
      fetch("/api/notes").then(r => r.json()),
    ]);
    CONTENT = content;
    NOTES = notes || {};
    buildIndex();
    buildTree();
    selectNode("c1");
  }

  boot().catch(err => {
    contentEl.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  });
})();
