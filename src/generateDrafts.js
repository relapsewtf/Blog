import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

dotenv.config();

const SCRAPE_DIR = path.resolve(process.cwd(), "data/x-scrape");
const DRAFT_DIR = path.resolve(process.cwd(), "data/drafts");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getAiClient() {
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (claudeKey) {
    const model = process.env.CLAUDE_MODEL || "claude-opus-4-6";
    const client = new Anthropic({ apiKey: claudeKey });

    return {
      type: "claude",
      async generate({ prompt }) {
        const message = await client.messages.create({
          model,
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        const textBlocks = (message.content || [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "");
        return textBlocks.join("").trim();
      },
    };
  }

  if (openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey });
    return {
      type: "openai",
      async generate({ prompt }) {
        const response = await client.responses.create({
          model: "gpt-4o-mini",
          input: prompt,
          max_output_tokens: 220,
        });
        return response.output_text || response.output?.[0]?.content?.[0]?.text || "";
      },
    };
  }

  throw new Error(
    "Missing AI credentials. Set CLAUDE_API_KEY (preferred) or OPENAI_API_KEY in your environment.\nSee README.md for details."
  );
}

function loadScrapeFiles() {
  if (!fs.existsSync(SCRAPE_DIR)) return [];
  return fs.readdirSync(SCRAPE_DIR).filter((f) => f.endsWith(".json"));
}

function normalizeText(text) {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

async function generateDraft(ai, tweet) {
  const prompt = `
Human: You are a professional content creator for a high-end technology audience.

Write a short (max 120 words) LinkedIn-style post based on this tweet. Make it insightful, topical, and relevant to AI/HR (recruiting), semiconductors, or high-voltage/energy engineering depending on context. Use a confident and thoughtful tone.

Tweet: "${normalizeText(tweet.text)}"

Include a short call-to-action like "Follow for more updates" or "Share if you found this useful".

Assistant:`;

  const text = await ai.generate({ prompt });
  return text.trim();
}

async function run() {
  ensureDir(DRAFT_DIR);

  const ai = getAiClient();
  const files = loadScrapeFiles();

  console.log(`Found ${files.length} scrape files in ${SCRAPE_DIR}`);

  for (const file of files) {
    const filePath = path.join(SCRAPE_DIR, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);

    const tweets = Array.isArray(data.tweets) ? data.tweets : [];
    if (!tweets.length) continue;

    const draftFileName = file.replace(/\.json$/, "-drafts.json");
    const draftPath = path.join(DRAFT_DIR, draftFileName);

    const drafts = [];

    for (const tweet of tweets.slice(0, 10)) {
      const draftText = await generateDraft(ai, tweet);
      drafts.push({
        id: tweet.url || tweet.handle + "-" + Math.random().toString(16).slice(2),
        source: file,
        tweet,
        draft: draftText,
      });
    }

    fs.writeFileSync(draftPath, JSON.stringify({ source: file, drafts }, null, 2));
    console.log(`✅ Generated drafts for ${file} → ${draftPath}`);
  }

  console.log("Done generating drafts.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
