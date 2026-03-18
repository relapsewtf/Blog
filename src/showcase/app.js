const draftFiles = [
  "./data/drafts/account-anthropicai-drafts.json",
  "./data/drafts/account-googlelabs-drafts.json",
  "./data/drafts/account-recruitingdaily-drafts.json",
  "./data/drafts/cluster-highvoltage-drafts.json",
];
const TOP_DRAFTS_API = "/api/top-drafts";

const ui = {
  introOverlay: document.querySelector("#intro-overlay"),
  hero: document.querySelector(".hero"),
  grid: document.querySelector("#card-grid"),
  featuredCard: document.querySelector("#featured-card"),
  importantGrid: document.querySelector("#important-grid"),
  tickerTrack: document.querySelector("#ticker-track"),
  cursorAura: document.querySelector("#cursor-aura"),
  floatParticles: document.querySelector("#float-particles"),
  scrollProgress: document.querySelector("#scroll-progress"),
  sourceFilter: document.querySelector("#source-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  searchInput: document.querySelector("#search-input"),
  clearFilters: document.querySelector("#clear-filters"),
  resultCount: document.querySelector("#result-count"),
  statTotal: document.querySelector("#stat-total"),
  statSources: document.querySelector("#stat-sources"),
  statAverage: document.querySelector("#stat-average"),
  modalBackdrop: document.querySelector("#modal-backdrop"),
  closeModal: document.querySelector("#close-modal"),
  modalSource: document.querySelector("#modal-source"),
  modalTitle: document.querySelector("#modal-title"),
  modalAuthor: document.querySelector("#modal-author"),
  modalTweet: document.querySelector("#modal-tweet"),
  modalLink: document.querySelector("#modal-link"),
  modalDraft: document.querySelector("#modal-draft"),
  modalWords: document.querySelector("#modal-words"),
  modalImportance: document.querySelector("#modal-importance"),
  copyDraft: document.querySelector("#copy-draft"),
};

const state = {
  drafts: [],
  filteredDrafts: [],
  importantDrafts: [],
  activeDraft: null,
};

const draftObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.12 }
);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("active");
      }
    });
  },
  { threshold: 0.22 }
);

init();

async function init() {
  const introPromise = runIntroSequence();
  setRevealAnimations();
  bindEvents();
  bindScrollEffects();
  bindHeroParallax();
  bindMagneticButtons();
  bindCursorAura();
  renderFloatingParticles();

  try {
    state.drafts = await loadDraftData();
    state.importantDrafts = [...state.drafts]
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 4);
    populateSourceFilter(state.drafts);
    updateStats(state.drafts);
    renderFeaturedAndImportant();
    renderTickerTopics(state.drafts);
    applyFilters();
    await introPromise;
  } catch {
    await introPromise;
    renderErrorState();
  }
}

async function loadDraftData() {
  const apiData = await fetchFromTopDraftsApi();
  if (apiData.length) {
    return apiData.map(normalizeApiDraft);
  }

  const collections = await Promise.all(
    draftFiles.map(async (file) => {
      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`Failed to load: ${file}`);
      }
      return response.json();
    })
  );
  return collections.flatMap(normalizeCollection);
}

async function fetchFromTopDraftsApi() {
  try {
    const response = await fetch(TOP_DRAFTS_API, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json();
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function normalizeApiDraft(item) {
  const sourceName = cleanSourceLabel(item.source ?? "scrape-results");
  const draftText = item.draftText || item.tweetText || "";
  const plainDraft = cleanMarkdown(draftText);

  return {
    id: item.id ?? `${sourceName}-${Math.random().toString(36).slice(2)}`,
    source: sourceName,
    author: item.author ?? "Unknown author",
    handle: item.handle ?? "",
    tweetText: item.tweetText ?? "",
    tweetUrl: item.tweetUrl ?? "#",
    draftText,
    plainDraft,
    wordCount: countWords(plainDraft),
    importanceScore:
      typeof item.importanceScore === "number"
        ? item.importanceScore
        : calculateImportanceScore({
            plainDraft,
            tweetText: item.tweetText ?? "",
            author: item.author ?? "",
          }),
  };
}

function normalizeCollection(collection) {
  const sourceName = cleanSourceLabel(collection.source ?? "unknown-source");

  return (collection.drafts ?? []).map((item, index) => {
    const draftText = item.draft ?? "";
    const plainDraft = cleanMarkdown(draftText);

    return {
      id: item.id ?? `${sourceName}-${index}`,
      source: sourceName,
      author: item.tweet?.author ?? "Unknown author",
      handle: item.tweet?.handle ?? "",
      tweetText: item.tweet?.text ?? "",
      tweetUrl: item.tweet?.url ?? "#",
      draftText,
      plainDraft,
      wordCount: countWords(plainDraft),
      importanceScore: calculateImportanceScore({
        plainDraft,
        tweetText: item.tweet?.text ?? "",
        author: item.tweet?.author ?? "",
      }),
    };
  });
}

function populateSourceFilter(drafts) {
  const sources = [...new Set(drafts.map((draft) => draft.source))].sort((a, b) =>
    a.localeCompare(b)
  );

  sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source;
    option.textContent = source;
    ui.sourceFilter.append(option);
  });
}

function updateStats(drafts) {
  const total = drafts.length;
  const sourceCount = new Set(drafts.map((draft) => draft.source)).size;
  const avg =
    total > 0
      ? Math.round(drafts.reduce((sum, draft) => sum + draft.wordCount, 0) / total)
      : 0;

  animateNumber(ui.statTotal, total);
  animateNumber(ui.statSources, sourceCount);
  animateNumber(ui.statAverage, avg, " words");
}

function applyFilters() {
  const query = ui.searchInput.value.trim().toLowerCase();
  const source = ui.sourceFilter.value;
  const sort = ui.sortFilter.value;

  const filtered = state.drafts.filter((draft) => {
    const queryMatch =
      !query ||
      draft.plainDraft.toLowerCase().includes(query) ||
      draft.tweetText.toLowerCase().includes(query) ||
      draft.author.toLowerCase().includes(query);
    const sourceMatch = source === "all" || draft.source === source;
    return queryMatch && sourceMatch;
  });

  const sorted = sortDrafts(filtered, sort);
  state.filteredDrafts = sorted;
  renderCards(sorted);
  ui.resultCount.textContent = `${sorted.length} draft${sorted.length === 1 ? "" : "s"} found`;
}

function sortDrafts(drafts, sortBy) {
  const output = [...drafts];
  if (sortBy === "shortest") {
    output.sort((a, b) => a.wordCount - b.wordCount);
  } else if (sortBy === "source") {
    output.sort((a, b) => a.source.localeCompare(b.source));
  } else if (sortBy === "author") {
    output.sort((a, b) => a.author.localeCompare(b.author));
  } else {
    output.sort((a, b) => b.wordCount - a.wordCount);
  }
  return output;
}

function renderCards(drafts) {
  ui.grid.innerHTML = "";

  if (!drafts.length) {
    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.textContent = "No drafts match your filters. Try a different keyword or source.";
    ui.grid.append(empty);
    return;
  }

  drafts.forEach((draft, index) => {
    const card = document.createElement("article");
    card.className = "draft-card";
    card.style.transitionDelay = `${Math.min(index * 16, 220)}ms`;
    card.innerHTML = `
      <div class="card-top">
        <div>
          <p class="card-source">${escapeHtml(draft.source)}</p>
          <p class="card-author">${escapeHtml(draft.author)} <span class="pill">${escapeHtml(
      draft.handle
    )}</span></p>
        </div>
      </div>
      <p class="card-preview">${escapeHtml(getPreview(draft.plainDraft, 220))}</p>
      <div class="card-footer">
        <span class="pill">${draft.wordCount} words</span>
        <button class="card-action" data-draft-id="${encodeURIComponent(
          draft.id
        )}">Read draft</button>
      </div>
    `;

    ui.grid.append(card);
    draftObserver.observe(card);
    attachTiltEffect(card);
  });
}

function renderErrorState() {
  ui.resultCount.textContent = "Unable to load draft files.";
  ui.featuredCard.innerHTML = "";
  ui.importantGrid.innerHTML = "";
  ui.grid.innerHTML = `
    <article class="empty-state">
      Draft files could not be fetched. Serve this folder with a local server and reload.
      <br />
      Example: <code>npx serve .</code> or <code>python3 -m http.server</code>
    </article>
  `;
}

function renderFeaturedAndImportant() {
  const [featured, ...rest] = state.importantDrafts;
  if (!featured) {
    return;
  }

  ui.featuredCard.innerHTML = `
    <div class="featured-meta">
      <p class="card-source">${escapeHtml(featured.source)}</p>
      <span class="importance-badge">Importance ${featured.importanceScore}</span>
    </div>
    <h3 class="featured-title">${escapeHtml(getPreview(featured.plainDraft, 96))}</h3>
    <p class="featured-preview">${escapeHtml(getPreview(featured.plainDraft, 360))}</p>
    <div class="featured-actions">
      <span class="pill">${featured.wordCount} words • ${escapeHtml(featured.author)}</span>
      <button class="card-action open-draft" data-draft-id="${encodeURIComponent(featured.id)}">Read featured</button>
    </div>
  `;

  ui.importantGrid.innerHTML = "";
  rest.forEach((draft) => {
    const card = document.createElement("article");
    card.className = "important-card";
    card.innerHTML = `
      <p class="card-source">${escapeHtml(draft.source)}</p>
      <p class="card-author">${escapeHtml(draft.author)}</p>
      <p class="card-preview">${escapeHtml(getPreview(draft.plainDraft, 130))}</p>
      <div class="card-footer">
        <span class="importance-badge">Score ${draft.importanceScore}</span>
        <button class="card-action open-draft" data-draft-id="${encodeURIComponent(draft.id)}">Read</button>
      </div>
    `;
    ui.importantGrid.append(card);
  });
}

function renderTickerTopics(drafts) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "are",
    "your",
    "you",
    "just",
    "more",
    "into",
    "than",
    "have",
    "will",
    "about",
    "their",
    "they",
    "not",
    "its",
    "our",
    "how",
    "all",
    "can",
  ]);

  const counts = new Map();
  drafts.forEach((draft) => {
    draft.plainDraft
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 4 && !stopWords.has(word))
      .forEach((word) => {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      });
  });

  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map(([word]) => `#${word}`);

  const tickerText = topics.length
    ? topics.join("   •   ") + "   •   " + topics.join("   •   ")
    : "AI strategy   •   recruiting   •   policy   •   automation";
  ui.tickerTrack.textContent = tickerText;
}

function openModal(draft) {
  state.activeDraft = draft;
  const headline = getPreview(draft.plainDraft.replace(/\n+/g, " "), 82) || "Draft details";
  ui.modalSource.textContent = draft.source;
  ui.modalTitle.textContent = headline;
  ui.modalAuthor.textContent = `By ${draft.author} ${draft.handle}`.trim();
  ui.modalTweet.textContent = draft.tweetText || "No source post text available.";
  ui.modalLink.href = draft.tweetUrl || "#";
  ui.modalDraft.innerHTML = renderRichDraft(draft.draftText);
  ui.modalWords.textContent = `${draft.wordCount} words`;
  ui.modalImportance.textContent = `Importance ${draft.importanceScore}`;
  ui.modalBackdrop.classList.add("active");
  ui.modalBackdrop.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  ui.closeModal.focus();
}

function closeModal() {
  ui.modalBackdrop.classList.remove("active");
  ui.modalBackdrop.setAttribute("aria-hidden", "true");
  ui.copyDraft.classList.remove("copied");
  ui.copyDraft.textContent = "Copy draft";
  document.body.style.overflow = "";
}

function bindEvents() {
  ui.searchInput.addEventListener("input", applyFilters);
  ui.sourceFilter.addEventListener("change", applyFilters);
  ui.sortFilter.addEventListener("change", applyFilters);

  ui.clearFilters.addEventListener("click", () => {
    ui.searchInput.value = "";
    ui.sourceFilter.value = "all";
    ui.sortFilter.value = "longest";
    applyFilters();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".open-draft, .card-action");
    if (!button) {
      return;
    }
    const id = decodeURIComponent(button.dataset.draftId ?? "");
    const draft = state.drafts.find((entry) => entry.id === id);
    if (draft) {
      openModal(draft);
    }
  });

  ui.closeModal.addEventListener("click", closeModal);
  ui.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === ui.modalBackdrop) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  });

  ui.copyDraft.addEventListener("click", async () => {
    if (!state.activeDraft) {
      return;
    }
    try {
      await navigator.clipboard.writeText(state.activeDraft.draftText);
      ui.copyDraft.classList.add("copied");
      ui.copyDraft.textContent = "Copied";
    } catch {
      ui.copyDraft.textContent = "Clipboard unavailable";
    }
  });
}

function setRevealAnimations() {
  document.querySelectorAll(".reveal").forEach((element, index) => {
    element.style.transitionDelay = `${index * 80}ms`;
    revealObserver.observe(element);
  });
}

function bindScrollEffects() {
  const update = () => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
    ui.scrollProgress.style.width = `${progress}%`;
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

function bindHeroParallax() {
  if (!ui.hero) {
    return;
  }

  ui.hero.addEventListener("mousemove", (event) => {
    const rect = ui.hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    ui.hero.style.transform = `perspective(900px) rotateX(${(-y * 2).toFixed(2)}deg) rotateY(${(x * 3).toFixed(2)}deg)`;
  });

  ui.hero.addEventListener("mouseleave", () => {
    ui.hero.style.transform = "";
  });
}

function bindMagneticButtons() {
  document.querySelectorAll(".magnetic").forEach((button) => {
    button.addEventListener("mousemove", (event) => {
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      button.style.transform = `translate(${x * 0.08}px, ${y * 0.12}px)`;
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "";
    });
  });
}

function bindCursorAura() {
  if (!ui.cursorAura) {
    return;
  }

  const move = (event) => {
    ui.cursorAura.style.left = `${event.clientX}px`;
    ui.cursorAura.style.top = `${event.clientY}px`;
    ui.cursorAura.style.opacity = "1";
  };

  window.addEventListener("mousemove", move, { passive: true });
  window.addEventListener("mouseleave", () => {
    ui.cursorAura.style.opacity = "0";
  });
}

function renderFloatingParticles() {
  if (!ui.floatParticles) {
    return;
  }

  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("span");
    particle.className = "float-particle";
    particle.style.setProperty("--x", `${Math.random() * 100}%`);
    particle.style.setProperty("--size", `${Math.random() * 5 + 3}px`);
    particle.style.setProperty("--duration", `${Math.random() * 11 + 14}s`);
    particle.style.setProperty("--delay", `${Math.random() * -18}s`);
    ui.floatParticles.append(particle);
  }
}

async function runIntroSequence() {
  if (!ui.introOverlay) {
    document.body.classList.remove("intro-lock");
    return;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    ui.introOverlay.classList.add("hide");
    document.body.classList.remove("intro-lock");
    return;
  }

  const introDurationMs = 5800;
  await wait(introDurationMs);
  ui.introOverlay.classList.add("hide");
  document.body.classList.remove("intro-lock");
  await wait(720);
}

function attachTiltEffect(card) {
  card.addEventListener("mousemove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg) translateY(-4px)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
}

function animateNumber(element, target, suffix = "") {
  const duration = 900;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = `${Math.round(target * eased)}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function calculateImportanceScore({ plainDraft, tweetText, author }) {
  const combined = `${plainDraft} ${tweetText} ${author}`.toLowerCase();
  const keywordWeights = [
    ["security", 12],
    ["vulnerability", 12],
    ["policy", 10],
    ["tariff", 10],
    ["trade", 9],
    ["ai", 8],
    ["semiconductor", 8],
    ["infrastructure", 7],
    ["recruiting", 6],
    ["strategy", 6],
  ];

  const keywordScore = keywordWeights.reduce((score, [keyword, weight]) => {
    return score + (combined.includes(keyword) ? weight : 0);
  }, 0);

  const lengthScore = Math.min(countWords(plainDraft) / 18, 14);
  return Math.round(30 + keywordScore + lengthScore);
}

function renderRichDraft(rawDraft) {
  const safe = escapeHtml(rawDraft ?? "");
  const lines = safe.split(/\n/);
  const html = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  lines.forEach((line) => {
    const value = line.trim();
    if (!value) {
      closeList();
      return;
    }

    if (/^###\s+/.test(value)) {
      closeList();
      html.push(`<h3>${inlineFormat(value.replace(/^###\s+/, ""))}</h3>`);
      return;
    }
    if (/^##\s+/.test(value)) {
      closeList();
      html.push(`<h2>${inlineFormat(value.replace(/^##\s+/, ""))}</h2>`);
      return;
    }
    if (/^#\s+/.test(value)) {
      closeList();
      html.push(`<h1>${inlineFormat(value.replace(/^#\s+/, ""))}</h1>`);
      return;
    }
    if (/^[-*]\s+/.test(value)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineFormat(value.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${inlineFormat(value)}</p>`);
  });

  closeList();
  return html.join("");
}

function inlineFormat(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function cleanSourceLabel(source) {
  return source.replace(/\.json$/i, "").replace(/[-_]/g, " ");
}

function cleanMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function getPreview(text, maxLength) {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
