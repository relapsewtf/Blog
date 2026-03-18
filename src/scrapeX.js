import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { keywordClusters, watchAccounts, buildKeywordQuery, buildAccountQuery, nitterInstance } from "./config.js";

puppeteer.use(StealthPlugin());

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_DATASET_NAME = process.env.APIFY_DATASET_NAME || "x-scrape";

if (!APIFY_TOKEN) {
  console.warn("⚠️ No APIFY_API_TOKEN set. Data will not be uploaded to Apify.");
}

const OUTPUT_DIR = path.resolve(process.cwd(), "data/x-scrape");

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrollPage(page, maxScrolls = 6, delayMs = 1000) {
  for (let i = 0; i < maxScrolls; i += 1) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await sleep(delayMs);
  }
}

async function scrapeTweetsFromSearch(page, query) {
  const url = `${nitterInstance}/search?f=tweets&q=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "networkidle2" });

  // Give the page time to load and render results
  await sleep(1500);
  await scrollPage(page, 6, 1000);

  const tweets = await page.$$eval(".timeline-item", (nodes) => {
    return nodes.map((item) => {
      const authorElem = item.querySelector(".fullname");
      const handleElem = item.querySelector(".username");
      const timeElem = item.querySelector(".tweet-date > a > time");
      const textElem = item.querySelector(".tweet-content");

      const stats = {};
      item.querySelectorAll(".tweet-stat").forEach((stat) => {
        const key = stat.getAttribute("data-stat");
        const value = stat.innerText?.trim();
        if (key && value) stats[key] = value;
      });

      const linkElem = item.querySelector(".tweet-date > a");

      return {
        author: authorElem?.innerText || null,
        handle: handleElem?.innerText || null,
        text: textElem?.innerText || null,
        time: timeElem?.getAttribute("datetime") || null,
        stats,
        url: linkElem ? linkElem.href : null
      };
    });
  });

  return tweets.filter((t) => t.text && t.handle);
}

async function getOrCreateApifyDataset() {
  if (!APIFY_TOKEN) return null;

  const baseUrl = "https://api.apify.com/v2";
  const headers = {
    Authorization: `Bearer ${APIFY_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Try to fetch an existing dataset by name (name works as id as well)
  const existing = await fetch(`${baseUrl}/datasets/${APIFY_DATASET_NAME}`, { headers });
  if (existing.ok) {
    const json = await existing.json();
    return json.id || json.datasetId || APIFY_DATASET_NAME;
  }

  // Create a new dataset if it doesn't exist
  const created = await fetch(`${baseUrl}/datasets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: APIFY_DATASET_NAME }),
  });

  if (!created.ok) {
    const body = await created.text();
    console.warn("⚠️ Failed to create Apify dataset:", body);
    return null;
  }

  const json = await created.json();
  return json.id || json.datasetId;
}

async function uploadToApify(datasetId, items) {
  if (!APIFY_TOKEN || !datasetId) return;

  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=false`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${APIFY_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(items),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn("⚠️ Failed to upload to Apify dataset:", body);
  }
}

async function run() {
  console.log("Starting X.com scraping run...");
  ensureOutputDir();

  const apifyDatasetId = await getOrCreateApifyDataset();
  if (apifyDatasetId) {
    console.log(`Using Apify dataset: ${apifyDatasetId}`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });

  const tasks = [];

  // Keyword clusters
  for (const [clusterName, keywords] of Object.entries(keywordClusters)) {
    const query = buildKeywordQuery(keywords, { lang: "en", excludeRetweets: true, excludeReplies: true });
    tasks.push({ name: `cluster-${clusterName}`, query, key: `cluster-${safeName(clusterName)}` });
  }

  // Accounts
  for (const account of watchAccounts) {
    const query = buildAccountQuery(account, { lang: "en", excludeRetweets: true, excludeReplies: true });
    tasks.push({ name: `account-${account}`, query, key: `account-${safeName(account)}` });
  }

  for (const task of tasks) {
    console.log(`▶ Scraping ${task.name}`);
    try {
      const tweets = await scrapeTweetsFromSearch(page, task.query);
      const outPath = path.join(OUTPUT_DIR, `${task.key}.json`);
      const content = { query: task.query, fetchedAt: new Date().toISOString(), tweets };
      fs.writeFileSync(outPath, JSON.stringify(content, null, 2));
      console.log(`   ✅ Saved ${tweets.length} tweets to ${outPath}`);

      if (apifyDatasetId) {
        const items = tweets.map((tweet) => ({
          task: task.name,
          query: task.query,
          fetchedAt: content.fetchedAt,
          ...tweet,
        }));
        await uploadToApify(apifyDatasetId, items);
        console.log(`   ✅ Uploaded ${items.length} items to Apify dataset ${apifyDatasetId}`);
      }
    } catch (err) {
      console.error(`   ❌ Error scraping ${task.name}:`, err.message || err);
    }

    await sleep(1200);
  }

  await browser.close();
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
