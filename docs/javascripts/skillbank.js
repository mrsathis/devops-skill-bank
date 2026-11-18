/* Skill bank interactivity: progress tracking, home widgets, practice mode.
 * Progress lives in localStorage only (this browser). Everything degrades gracefully
 * if storage or the questions file is unavailable. */
(function () {
  "use strict";

  const STORE_KEY = "sb.progress.v1";
  const BIG_TECH = ["netflix", "uber", "cloudflare", "amazon", "aws", "nvidia", "tesla",
    "linkedin", "airbnb", "atlassian", "jiohotstar", "meesho"];
  const LEVELS = [
    [0, "Getting started"], [10, "Curious"], [40, "Practitioner"], [100, "On-call ready"],
    [200, "Senior"], [400, "Staff"], [700, "Principal"], [1000, "Production legend"]];
  const AREA_NAMES = {
    "kubernetes": "Kubernetes", "docker": "Docker", "terraform": "Terraform",
    "cicd-git": "CI/CD and Git", "aws-cloud": "AWS and cloud", "azure": "Azure",
    "linux-networking": "Linux and networking", "sre-observability": "SRE and observability",
    "architecture-leadership": "Architecture and leadership", "finops": "FinOps",
    "general-devops": "General DevOps", "core": "Core answers"};

  /* ---------- helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const siteRoot = () => (typeof __md_scope !== "undefined" ? __md_scope : new URL("/", location));
  const siteUrl = (path) => new URL(path, siteRoot()).href;
  const today = () => new Date().toISOString().slice(0, 10);

  function slugify(text) { // must match hooks/questions.py
    const t = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return "q-" + t.slice(0, 60).replace(/-+$/, "");
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return { done: raw.done || {}, review: raw.review || {}, days: raw.days || {}, goal: raw.goal || 5 };
    } catch (e) { return { done: {}, review: {}, days: {}, goal: 5 }; }
  }
  function save(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  function markDone(id, done) {
    const s = load();
    if (done) {
      if (!s.done[id]) s.days[today()] = (s.days[today()] || 0) + 1;
      s.done[id] = Date.now(); delete s.review[id];
    } else { delete s.done[id]; }
    save(s); return s;
  }
  function markReview(id) {
    const s = load(); s.review[id] = Date.now(); delete s.done[id]; save(s); return s;
  }

  function streak(s) {
    let n = 0; const d = new Date();
    if (!s.days[today()]) d.setDate(d.getDate() - 1); // today not done yet: count from yesterday
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!s.days[key]) break;
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function level(count) {
    let i = 0; while (i + 1 < LEVELS.length && count >= LEVELS[i + 1][0]) i++;
    return { n: i + 1, name: LEVELS[i][1], next: LEVELS[i + 1] };
  }

  let dataPromise = null;
  function loadQuestions() {
    if (!dataPromise) {
      dataPromise = fetch(siteUrl("assets/data/questions.json"))
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((d) => d.questions)
        .catch(() => []);
    }
    return dataPromise;
  }
  const fixLinks = (root) => $$("a[href]", root).forEach((a) => {
    const h = a.getAttribute("href");
    if (!/^(https?:|#|mailto:)/.test(h)) a.href = siteUrl(h);
  });
  const fmt = (n) => n.toLocaleString("en");

  /* ---------- interview pages: "practised" toggles + page progress ---------- */
  function enhanceQuestionPage() {
    if (!/\/interview-prep\/(companies|topics)\//.test(location.pathname) &&
        !/\/interview-prep\/core-answers\//.test(location.pathname)) return;
    const article = $("article.md-content__inner");
    if (!article) return;
    const pagePath = new URL(location.href).pathname.replace(new URL(siteRoot()).pathname, "");
    const isCore = /core-answers/.test(location.pathname);
    let targets = [];
    if (isCore) {
      targets = $$("h3[id]", article).map((h) => ({ el: h, id: pagePath + "#" + h.id }));
    } else {
      targets = $$("p", article).filter((p) => p.firstElementChild && p.firstElementChild.tagName === "STRONG"
        && p.firstChild === p.firstElementChild && p.firstElementChild.textContent.length > 12
        && !p.firstElementChild.textContent.trim().endsWith(":"))
        .map((p) => {
          const anchor = slugify(p.firstElementChild.textContent);
          if (!p.id) p.id = anchor;
          return { el: p, id: pagePath + "#" + anchor };
        });
    }
    if (!targets.length) return;

    const bar = document.createElement("div");
    bar.className = "sb-pagebar";
    bar.innerHTML = '<div class="sb-pagebar__text"><strong></strong> practised on this page</div>' +
      '<div class="sb-bar"><span></span></div>' +
      '<a class="sb-pagebar__link" href="' + siteUrl("practice/") + '">Practise as flashcards →</a>';
    const h1 = $("h1", article);
    if (h1) h1.after(bar); else article.prepend(bar);

    const refresh = () => {
      const s = load();
      const done = targets.filter((t) => s.done[t.id]).length;
      $("strong", bar).textContent = done + " / " + targets.length;
      $(".sb-bar span", bar).style.width = (100 * done / targets.length) + "%";
    };

    targets.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sb-tick";
      const sync = () => {
        const on = !!load().done[t.id];
        btn.classList.toggle("is-done", on);
        btn.setAttribute("aria-pressed", on);
        btn.textContent = on ? "✓ Practised" : "Mark practised";
      };
      btn.addEventListener("click", () => { markDone(t.id, !load().done[t.id]); sync(); refresh(); });
      sync();
      if (isCore) t.el.appendChild(btn); else t.el.firstElementChild.after(btn);
      t.el.classList.add("sb-has-tick");
    });
    refresh();
  }

  /* ---------- home page ---------- */
  function renderHomeStats(qs) {
    const s = load();
    const ids = new Set(qs.map((q) => q.id));
    const done = Object.keys(s.done).filter((id) => ids.has(id)).length;
    const total = qs.length || 1;
    $$('[data-sb-count="questions"]').forEach((e) => (e.textContent = fmt(qs.length)));
    $$('[data-sb-count="companies"]').forEach((e) =>
      (e.textContent = new Set(qs.filter((q) => q.kind === "company").map((q) => q.key)).size));
    if (!$("#sb-done")) return;
    $("#sb-done").textContent = fmt(done);
    const ring = $("#sb-ring-value");
    const c = 2 * Math.PI * 52;
    ring.style.strokeDasharray = c;
    ring.style.strokeDashoffset = c * (1 - done / total);
    const st = streak(s);
    $("#sb-streak").textContent = st;
    $("#sb-streak-hint").textContent = s.days[today()] ? "Practised today. Keep it going tomorrow."
      : st ? "Practise one card today to keep your streak." : "Practise one card today to start a streak.";
    const t = s.days[today()] || 0;
    $("#sb-today").textContent = t;
    $("#sb-goal").textContent = s.goal;
    $("#sb-today-bar").style.width = Math.min(100, 100 * t / s.goal) + "%";
    const lv = level(done);
    $("#sb-level").textContent = "Level " + lv.n;
    $("#sb-level-name").textContent = lv.name;
    $("#sb-level-next").textContent = lv.next ? (lv.next[0] - done) + " more to " + lv.next[1] : "Top level reached";

    // paths
    const pathCount = (key) => {
      const set = filterQuestions(qs, key);
      const d = set.filter((q) => s.done[q.id]).length;
      return d + " / " + set.length + " practised";
    };
    $$("[data-sb-path]").forEach((e) => (e.textContent = pathCount(e.dataset.sbPath)));

    // areas
    const areas = $("#sb-areas");
    if (areas) {
      const groups = {};
      qs.forEach((q) => {
        const k = q.kind === "company" ? "company" : q.key;
        (groups[k] = groups[k] || []).push(q);
      });
      const order = ["core", "kubernetes", "aws-cloud", "terraform", "cicd-git", "docker",
        "sre-observability", "linux-networking", "azure", "architecture-leadership", "finops",
        "general-devops", "company"];
      areas.innerHTML = order.filter((k) => groups[k]).map((k) => {
        const list = groups[k];
        const d = list.filter((q) => s.done[q.id]).length;
        const pct = Math.round(100 * d / list.length);
        const name = k === "company" ? "Company rounds" : AREA_NAMES[k] || k;
        const href = k === "company" ? siteUrl("interview-prep/") :
          k === "core" ? siteUrl("interview-prep/core-answers/") : siteUrl("interview-prep/topics/" + k + "/");
        return '<a class="sb-area" href="' + href + '"><strong>' + name + '</strong>' +
          '<span class="sb-area__meta">' + d + " / " + list.length + "</span>" +
          '<span class="sb-bar"><span style="width:' + pct + '%"></span></span></a>';
      }).join("");
    }
  }

  function dailyIndex(n) {
    const d = today().replace(/-/g, "");
    let h = 0; for (const ch of d) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % n;
  }

  function initHome() {
    if (!$(".sb-home")) return;
    loadQuestions().then((qs) => {
      renderHomeStats(qs);
      if (!qs.length) { $("#sb-qotd-q").textContent = "Questions are loading slowly. Try the Practice page."; return; }
      // prefer scenario-style questions for the daily pick
      const pool = qs.filter((q) => q.kind !== "core" && q.q.length > 50);
      let current = pool[dailyIndex(pool.length)];
      const show = (q) => {
        current = q;
        $("#sb-qotd-q").textContent = q.q;
        $("#sb-qotd-source").textContent = q.page.replace(/:.*/, "").replace(/ \(company not named\)/, "");
        const a = $("#sb-qotd-a");
        a.innerHTML = q.a + '<p class="sb-more"><a href="' + siteUrl(q.url) + '">' +
          (q.more ? "Read the full answer →" : "Open on its page →") + "</a></p>";
        fixLinks(a);
        a.hidden = true;
        $("#sb-qotd-reveal").hidden = false;
        $("#sb-qotd-done").hidden = true;
      };
      show(current);
      $("#sb-qotd-reveal").onclick = () => {
        $("#sb-qotd-a").hidden = false; $("#sb-qotd-reveal").hidden = true; $("#sb-qotd-done").hidden = false;
      };
      $("#sb-qotd-done").onclick = () => {
        markDone(current.id, true); renderHomeStats(qs);
        $("#sb-qotd-done").textContent = "✓ Counted"; $("#sb-qotd-done").disabled = true;
      };
      $("#sb-qotd-next").onclick = () => {
        $("#sb-qotd-done").textContent = "I knew this"; $("#sb-qotd-done").disabled = false;
        show(pool[Math.floor(Math.random() * pool.length)]);
      };
    });
    typeTerminal();
  }

  function typeTerminal() {
    const el = $("#sb-term code");
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const full = el.textContent;
    el.textContent = "";
    let i = 0;
    const step = () => {
      el.textContent = full.slice(0, i);
      i += full[i] === "\n" ? 1 : 3;
      if (i <= full.length + 3) setTimeout(step, full[i - 1] === "\n" ? 120 : 12);
    };
    setTimeout(step, 300);
  }

  /* ---------- practice page ---------- */
  function filterQuestions(qs, key) {
    if (!key || key === "all") return qs;
    if (key === "core") return qs.filter((q) => q.kind === "core");
    if (key === "big-tech") return qs.filter((q) => q.kind === "company" && BIG_TECH.includes(q.key));
    if (key === "companies") return qs.filter((q) => q.kind === "company");
    if (key.startsWith("topic-")) return qs.filter((q) => q.kind === "topic" && q.key === key.slice(6));
    if (key.startsWith("company-")) return qs.filter((q) => q.kind === "company" && q.key === key.slice(8));
    return qs;
  }

  function initPractice() {
    const app = $("#sb-practice");
    if (!app) return;
    app.innerHTML = '<p class="sb-loading">Loading questions…</p>';
    loadQuestions().then((qs) => {
      if (!qs.length) { app.innerHTML = "<p>Couldn't load the questions file. Refresh to try again.</p>"; return; }
      const companies = [...new Set(qs.filter((q) => q.kind === "company").map((q) => q.key))].sort();
      const companyName = (k) => (qs.find((q) => q.key === k) || {}).page.replace(/:.*/, "");
      const topics = [...new Set(qs.filter((q) => q.kind === "topic").map((q) => q.key))];
      app.innerHTML = `
        <div class="sb-controls">
          <label>Deck
            <select id="sb-deck">
              <option value="all">Everything</option>
              <option value="core">Core questions (asked everywhere)</option>
              <option value="big-tech">Big-tech scenario rounds</option>
              <option value="companies">All company rounds</option>
              <optgroup label="Topics">${topics.map((t) => `<option value="topic-${t}">${AREA_NAMES[t] || t}</option>`).join("")}</optgroup>
              <optgroup label="Companies">${companies.map((c) => `<option value="company-${c}">${companyName(c)}</option>`).join("")}</optgroup>
            </select>
          </label>
          <label>Show
            <select id="sb-mode">
              <option value="new">Not practised yet</option>
              <option value="review">Marked for review</option>
              <option value="all">All in deck</option>
            </select>
          </label>
          <label class="sb-check"><input type="checkbox" id="sb-timer-on"> 2-minute answer timer</label>
        </div>
        <div class="sb-deckstats" id="sb-deckstats"></div>
        <article class="sb-card" id="sb-card" aria-live="polite">
          <div class="sb-card__meta"><span class="sb-chip" id="sb-card-src"></span><span id="sb-card-pos"></span><span class="sb-timer" id="sb-timer" hidden>2:00</span></div>
          <h2 class="sb-card__q" id="sb-card-q"></h2>
          <p class="sb-card__hint" id="sb-card-hint">Answer out loud first: mechanism, steps in order, fix, prevention.</p>
          <div class="sb-card__a" id="sb-card-a" hidden></div>
          <div class="sb-card__actions">
            <button type="button" class="md-button md-button--primary" id="sb-reveal">Reveal answer <kbd>Space</kbd></button>
            <button type="button" class="md-button md-button--primary" id="sb-got" hidden>I knew it <kbd>K</kbd></button>
            <button type="button" class="md-button" id="sb-again" hidden>Review again <kbd>R</kbd></button>
            <button type="button" class="md-button sb-button--ghost" id="sb-skip">Skip <kbd>→</kbd></button>
          </div>
        </article>`;

      const deckSel = $("#sb-deck"), modeSel = $("#sb-mode");
      const hash = location.hash.slice(1);
      if (hash && [...deckSel.options].some((o) => o.value === hash)) deckSel.value = hash;

      let deck = [], pos = 0, timer = null, sessionDone = 0;

      const build = () => {
        const s = load();
        const base = filterQuestions(qs, deckSel.value);
        const mode = modeSel.value;
        deck = base.filter((q) => mode === "all" ? true : mode === "review" ? s.review[q.id] : !s.done[q.id]);
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        pos = 0;
        const d = base.filter((q) => s.done[q.id]).length;
        const r = base.filter((q) => s.review[q.id]).length;
        $("#sb-deckstats").innerHTML =
          `<span><strong>${d}</strong> / ${base.length} practised in this deck</span>` +
          `<span><strong>${r}</strong> marked for review</span>` +
          `<span><strong>${s.days[today()] || 0}</strong> practised today</span>` +
          `<span class="sb-bar"><span style="width:${base.length ? 100 * d / base.length : 0}%"></span></span>`;
        history.replaceState(null, "", "#" + deckSel.value);
        show();
      };

      const stopTimer = () => { clearInterval(timer); timer = null; $("#sb-timer").hidden = true; };
      const startTimer = () => {
        stopTimer();
        if (!$("#sb-timer-on").checked) return;
        let left = 120; const el = $("#sb-timer"); el.hidden = false; el.classList.remove("is-over");
        const tick = () => {
          el.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
          if (left <= 0) { el.classList.add("is-over"); clearInterval(timer); }
          left--;
        };
        tick(); timer = setInterval(tick, 1000);
      };

      const show = () => {
        const card = $("#sb-card");
        if (!deck.length || pos >= deck.length) {
          stopTimer();
          card.classList.add("is-empty");
          $("#sb-card-q").textContent = deck.length ? "Deck complete. Nice work." : "Nothing left in this view.";
          $("#sb-card-hint").textContent = sessionDone ? `You practised ${sessionDone} card${sessionDone > 1 ? "s" : ""} this session.` :
            "Pick another deck, or switch Show to “All in deck”.";
          ["#sb-card-a", "#sb-reveal", "#sb-got", "#sb-again", "#sb-skip"].forEach((s) => ($(s).hidden = true));
          $("#sb-card-src").textContent = ""; $("#sb-card-pos").textContent = "";
          return;
        }
        card.classList.remove("is-empty");
        const q = deck[pos];
        $("#sb-card-src").textContent = q.page.replace(/:.*/, "").replace(/ \(company not named\)/, "") + (q.section ? " · " + q.section : "");
        $("#sb-card-pos").textContent = (pos + 1) + " / " + deck.length;
        $("#sb-card-q").textContent = q.q;
        $("#sb-card-hint").textContent = "Answer out loud first: mechanism, steps in order, fix, prevention.";
        const a = $("#sb-card-a");
        a.innerHTML = q.a + `<p class="sb-more"><a href="${siteUrl(q.url)}">${q.more ? "Read the full answer" : "Open on its page"} →</a></p>`;
        fixLinks(a);
        a.hidden = true;
        $("#sb-reveal").hidden = false; $("#sb-got").hidden = true; $("#sb-again").hidden = true; $("#sb-skip").hidden = false;
        startTimer();
      };
      const reveal = () => {
        if ($("#sb-reveal").hidden) return;
        stopTimer();
        $("#sb-card-a").hidden = false; $("#sb-reveal").hidden = true; $("#sb-got").hidden = false; $("#sb-again").hidden = false;
      };
      const next = () => { pos++; show(); };
      const got = () => { if ($("#sb-got").hidden) return; markDone(deck[pos].id, true); sessionDone++; refreshStats(); next(); };
      const again = () => { if ($("#sb-again").hidden) return; markReview(deck[pos].id); refreshStats(); next(); };
      const refreshStats = () => {
        const s = load(); const base = filterQuestions(qs, deckSel.value);
        const d = base.filter((q) => s.done[q.id]).length;
        const r = base.filter((q) => s.review[q.id]).length;
        const spans = $$("#sb-deckstats > span");
        spans[0].innerHTML = `<strong>${d}</strong> / ${base.length} practised in this deck`;
        spans[1].innerHTML = `<strong>${r}</strong> marked for review`;
        spans[2].innerHTML = `<strong>${s.days[today()] || 0}</strong> practised today`;
        $("span", spans[3]).style.width = (base.length ? 100 * d / base.length : 0) + "%";
      };

      $("#sb-reveal").onclick = reveal; $("#sb-got").onclick = got; $("#sb-again").onclick = again;
      $("#sb-skip").onclick = next;
      deckSel.onchange = build; modeSel.onchange = build;
      $("#sb-timer-on").onchange = () => ($("#sb-card-a").hidden ? startTimer() : stopTimer());
      document.addEventListener("keydown", (e) => {
        if (!$("#sb-practice") || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
        if (e.key === " ") { e.preventDefault(); reveal(); }
        else if (e.key === "k" || e.key === "K") got();
        else if (e.key === "r" || e.key === "R") again();
        else if (e.key === "ArrowRight") next();
      });
      build();
    });
  }

  function init() {
    enhanceQuestionPage();
    initHome();
    initPractice();
  }

  if (typeof document$ !== "undefined" && document$.subscribe) document$.subscribe(init);
  else document.addEventListener("DOMContentLoaded", init);
})();
