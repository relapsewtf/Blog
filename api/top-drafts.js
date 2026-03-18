const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";

const TOP_RESULTS = 30;
const POOL_LIMIT = Number.parseInt(process.env.TOP_POOL_LIMIT ?? "220", 10);

export default async function handler(_req, res) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SECRET_KEY",
    });
    return;
  }

  try {
    const rows = await fetchScrapeRows();
    const candidates = rows.map(toCandidate).filter((entry) => entry.text.length > 0);

    if (!candidates.length) {
      res.status(200).json({
        items: [],
        scanned: rows.length,
        selected: 0,
        strategy: "none",
      });
      return;
    }

    const topIds = await selectTopIdsWithFallback(candidates);
    const selected = topIds
      .map((id, index) => candidates.find((item) => item.id === id))
      .filter(Boolean)
      .slice(0, TOP_RESULTS)
      .map((item, index) => ({
        id: item.id,
        source: item.task || "scrape results",
        author: item.author || "Unknown author",
        handle: item.handle || "",
        tweetText: item.text,
        tweetUrl: item.url || "#",
        draftText: item.draftText || item.text,
        importanceScore: Math.max(100 - index * 2, 40),
        insertedAt: item.insertedAt,
        task: item.task,
      }));

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      items: selected,
      scanned: candidates.length,
      selected: selected.length,
      strategy: CLAUDE_API_KEY ? "claude" : "heuristic",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch top drafts",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function fetchScrapeRows() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/scrape_results`);
  url.searchParams.set("select", "id,task,item,inserted_at");
  url.searchParams.set("limit", String(POOL_LIMIT));

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase query failed (${response.status})`);
  }

  return response.json();
}

function toCandidate(row) {
  const item = row.item ?? {};
  const text = pickBestText(item);
  const url = pickValue(item, [
    ["url"],
    ["tweet", "url"],
    ["link"],
    ["post", "url"],
  ]);
  const author = pickValue(item, [
    ["author"],
    ["tweet", "author"],
    ["user", "name"],
    ["account", "name"],
  ]);
  const handle = pickValue(item, [
    ["handle"],
    ["tweet", "handle"],
    ["user", "username"],
    ["account", "handle"],
  ]);
  const draftText = pickValue(item, [["draft"], ["generated_draft"], ["post"]]);

  return {
    id: Number(row.id),
    task: String(row.task ?? "scrape-results"),
    insertedAt: row.inserted_at,
    text,
    url,
    author,
    handle,
    draftText,
  };
}

async function selectTopIdsWithFallback(candidates) {
  if (!CLAUDE_API_KEY) {
    return heuristicTopIds(candidates);
  }

  try {
    const promptItems = candidates.slice(0, POOL_LIMIT).map((item) => ({
      id: item.id,
      task: item.task,
      author: item.author,
      handle: item.handle,
      url: item.url,
      text: truncate(item.text, 800),
    }));

    const message = await callClaude(promptItems);
    const parsed = parseJsonObject(message);
    const ids = Array.isArray(parsed?.top_ids) ? parsed.top_ids : [];
    const normalized = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .filter((id) => candidates.some((entry) => entry.id === id))
      .slice(0, TOP_RESULTS);

    if (normalized.length >= 5) {
      return normalized;
    }
  } catch {
    // Fall back to deterministic local ranking below.
  }

  return heuristicTopIds(candidates);
}

async function callClaude(items) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content:
            "Select the 30 most important items for strategic AI/tech/blog publishing. " +
            "Prioritize novelty, impact, urgency, and relevance. " +
            "Return strict JSON only with this schema: {\"top_ids\":[number,...]}.\n\n" +
            `Items:\n${JSON.stringify(items)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude request failed (${response.status})`);
  }

  const body = await response.json();
  const content = Array.isArray(body.content) ? body.content : [];
  const textBlock = content.find((entry) => entry.type === "text");
  return textBlock?.text ?? "";
}

function heuristicTopIds(candidates) {
  const keywords = [
    ["security", 8],
    ["vulnerability", 8],
    ["policy", 7],
    ["tariff", 7],
    ["trade", 6],
    ["ai", 6],
    ["model", 5],
    ["infrastructure", 5],
    ["semiconductor", 5],
    ["regulation", 5],
    ["launch", 4],
  ];

  return [...candidates]
    .map((entry) => {
      const text = entry.text.toLowerCase();
      const keywordScore = keywords.reduce(
        (score, [keyword, weight]) => score + (text.includes(keyword) ? weight : 0),
        0
      );
      const lengthScore = Math.min(entry.text.length / 280, 5);
      return {
        id: entry.id,
        score: keywordScore + lengthScore,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_RESULTS)
    .map((entry) => entry.id);
}

function pickBestText(item) {
  const direct = pickValue(item, [
    ["draft"],
    ["text"],
    ["tweet", "text"],
    ["content"],
    ["post", "text"],
    ["message"],
    ["body"],
    ["title"],
  ]);

  if (direct) {
    return normalizeText(direct);
  }

  const strings = [];
  collectStrings(item, strings, 0);
  const sorted = strings.sort((a, b) => b.length - a.length);
  return normalizeText(sorted[0] || "");
}

function collectStrings(value, bucket, depth) {
  if (depth > 4 || value == null) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 18) {
      bucket.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, bucket, depth + 1));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((entry) => collectStrings(entry, bucket, depth + 1));
  }
}

function pickValue(obj, paths) {
  for (const path of paths) {
    let current = obj;
    for (const key of path) {
      current = current?.[key];
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return "";
}

function normalizeText(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, max) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || start >= end) {
      return null;
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
