export const keywordClusters = {
  semiconductor: [
    "Semiconductor talent shortage DACH",
    "Halbleiter Fachkräftemangel",
    "Chip industry hiring Europe",
    "Semiconductor engineer recruiting",
    "TSMC expansion Europe jobs",
    "Halbleiterindustrie Ingenieure Schweiz",
    "swissmem"
  ],
  highVoltage: [
    "High voltage engineer shortage",
    "Energiewende Fachkräfte",
    "HV Engineering recruiting DACH",
    "Power electronics talent",
    "Grid expansion hiring Europe",
    "Transformatoren Ingenieure Stellenmarkt",
    "swissmem"
  ]
};

export const watchAccounts = [
  // Industry / engineering
  "TSMC",
  "Infineon",
  "VAT_Group",
  "BruggCables",
  "NVIDIA",

  // HR tech
  "HRTechFeed",
  "RecruitingDaily",

  // AI labs
  "googlelabs",
  "AnthropicAI",
  "OpenAI",

  // New additions
  "milesdeutscher",
  "AlexFinn",
  "polymarket"
];

export const defaultQueryOptions = {
  lang: process.env.X_QUERY_LANG || "en",
  excludeReplies: true,
  excludeRetweets: true,
  maxResults: 50
};

export const nitterInstance = process.env.NITTER_INSTANCE || "https://nitter.net";

/**
 * Build a query string for a keyword cluster.
 *
 * Example result:
 *  ("Semiconductor talent shortage DACH" OR "Halbleiter Fachkräftemangel" OR ...) lang:en -is:retweet -is:reply
 */
export function buildKeywordQuery(keywords, opts = defaultQueryOptions) {
  const quoted = keywords.map((k) => `"${k.replace(/"/g, "\"")}"`);
  const keywordExpr = `(${quoted.join(" OR ")})`;
  const parts = [keywordExpr];

  if (opts.lang) {
    parts.push(`lang:${opts.lang}`);
  }
  if (opts.excludeRetweets) {
    parts.push("-is:retweet");
  }
  if (opts.excludeReplies) {
    parts.push("-is:reply");
  }

  return parts.join(" ");
}

/**
 * Build a query string for a specific account.
 *
 * Example: from:TSMC lang:en -is:retweet -is:reply
 */
export function buildAccountQuery(account, opts = defaultQueryOptions) {
  const parts = [`from:${account}`];

  if (opts.lang) {
    parts.push(`lang:${opts.lang}`);
  }
  if (opts.excludeRetweets) {
    parts.push("-is:retweet");
  }
  if (opts.excludeReplies) {
    parts.push("-is:reply");
  }

  return parts.join(" ");
}

/**
 * Build a combined query for an account + keyword cluster.
 * Useful if you want to watch what a given account says about a topic.
 */
export function buildAccountKeywordQuery(account, keywords, opts = defaultQueryOptions) {
  const keywordExpr = buildKeywordQuery(keywords, { ...opts, excludeRetweets: false, excludeReplies: false });
  const accountExpr = `from:${account}`;
  const parts = [accountExpr, keywordExpr];

  if (opts.lang) {
    parts.push(`lang:${opts.lang}`);
  }
  if (opts.excludeRetweets) {
    parts.push("-is:retweet");
  }
  if (opts.excludeReplies) {
    parts.push("-is:reply");
  }

  return parts.join(" ");
}
