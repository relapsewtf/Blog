import fs from "fs";
import path from "path";
import { keywordClusters, watchAccounts, buildKeywordQuery, buildAccountQuery, buildAccountKeywordQuery, defaultQueryOptions } from "./config.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "data/x");

function getBearerToken() {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error(
      "Missing X_BEARER_TOKEN. Create a .env file (or set the env var) and add a valid bearer token."
    );
  }
  return token;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchX(query, max_results = defaultQueryOptions.maxResults) {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(max_results));
  url.searchParams.set("tweet.fields", "created_at,public_metrics,author_id,lang");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,verified");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getBearerToken()}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API error (${res.status}): ${body}`);
  }

  return res.json();
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
}

async function run() {
  console.log("Starting X.com query run...");
  ensureOutputDir();

  const tasks = [];

  // 1) Keyword clusters
  for (const [clusterName, keywords] of Object.entries(keywordClusters)) {
    const query = buildKeywordQuery(keywords);
    tasks.push({
      name: `cluster-${clusterName}`,
      query,
      key: `cluster-${safeName(clusterName)}`
    });
  }

  // 2) Accounts (timeline)
  for (const account of watchAccounts) {
    const query = buildAccountQuery(account);
    tasks.push({
      name: `account-${account}`,
      query,
      key: `account-${safeName(account)}`
    });
  }

  // 3) Account + cluster combinations (optional, can be noisy)
  for (const account of watchAccounts) {
    for (const [clusterName, keywords] of Object.entries(keywordClusters)) {
      const query = buildAccountKeywordQuery(account, keywords);
      tasks.push({
        name: `account-${account}-${clusterName}`,
        query,
        key: `account-${safeName(account)}-${safeName(clusterName)}`
      });
    }
  }

  for (const task of tasks) {
    console.log(`▶ Running query: ${task.name}`);
    console.log(`   ${task.query}`);

    try {
      const body = await fetchX(task.query);
      const outPath = path.join(OUTPUT_DIR, `${task.key}.json`);
      fs.writeFileSync(outPath, JSON.stringify({
        query: task.query,
        fetchedAt: new Date().toISOString(),
        data: body
      }, null, 2));
      console.log(`   ✅ Saved results to ${outPath}`);
    } catch (err) {
      console.error(`   ❌ Error fetching ${task.name}:`, err.message);
    }

    // Avoid pushing too hard on rate limits
    await sleep(1200);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
