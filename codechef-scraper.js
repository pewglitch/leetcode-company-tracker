/**
 * CodeChef scraper: contest list → problem codes → problem pages for rating + metadata.
 * Uses cache file to avoid repeated scraping. Set USER_AGENT to avoid blocks.
 */

const fs = require('fs');
const path = require('path');
const { load } = require('cheerio');

const CACHE_PATH = path.join(__dirname, 'codechef-problems.json');
const BASE = 'https://www.codechef.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultFetchOptions = {
  headers: { 'User-Agent': USER_AGENT },
  redirect: 'follow',
};

/** Fetch HTML and return text */
async function fetchHtml(url) {
  const res = await fetch(url, defaultFetchOptions);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

// Fallback past contest codes if contests page is client-rendered (CodeChef often uses React)
const FALLBACK_CONTEST_CODES = [
  'START139', 'START138', 'START137', 'LTIME119', 'LTIME118', 'COOK158', 'COOK157',
  'START136', 'LTIME117', 'COOK156', 'START135', 'COOK155', 'LTIME116',
];

/**
 * Parse contests page: extract past contest codes.
 * CodeChef contests page may be client-rendered; we try to parse links and fall back to a fixed list.
 */
async function scrapeContestList(limit = 15) {
  const codes = new Set(FALLBACK_CONTEST_CODES);
  try {
    const html = await fetchHtml(`${BASE}/contests`);
    const $ = load(html);
    $('a[href^="/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/^\/([A-Z0-9_]+)\/?$/);
      if (match) {
        const code = match[1];
        if (!['contests', 'problems', 'users', 'api', 'wiki', 'discuss', 'ide', 'ratings'].includes(code)) {
          codes.add(code);
        }
      }
    });
    $('a[href*="/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/codechef\.com\/([A-Z0-9_]+)/);
      if (m) {
        const code = m[1];
        if (!['contests', 'problems', 'users', 'api', 'wiki', 'discuss', 'ide', 'ratings', 'practice'].includes(code)) {
          codes.add(code);
        }
      }
    });
  } catch (e) {
    console.warn('Contests page fetch failed, using fallback list:', e.message);
  }
  let list = Array.from(codes).filter((c) => /^[A-Z0-9_]{3,}$/.test(c));
  list = list.slice(0, limit);
  return list;
}

/**
 * From a contest page, extract problem codes (links to /problems/CODE or /CONTEST/problems/CODE).
 */
async function scrapeProblemCodesFromContest(contestCode) {
  const url = `${BASE}/${contestCode}`;
  const html = await fetchHtml(url);
  const $ = load(html);
  const codes = new Set();

  $('a[href*="/problems/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/problems\/([A-Z0-9_]+)/);
    if (match) codes.add(match[1]);
  });

  return Array.from(codes);
}

/**
 * From a problem page, extract rating and title.
 * Rating often appears as "Rating: 1500" or in a data attribute / script.
 */
async function scrapeProblemMetadata(problemCode) {
  const url = `${BASE}/problems/${problemCode}`;
  const html = await fetchHtml(url);
  const $ = load(html);

  let rating = null;
  let title = problemCode;

  // Title: often in h1 or breadcrumb
  const h1 = $('h1').first().text().trim();
  if (h1) title = h1;

  // Rating: look for text like "Rating: 1500" or "Rated for Div 2"
  const bodyText = $('body').text();
  const ratingMatch = bodyText.match(/Rating[:\s]*(\d+)/i) || bodyText.match(/Rated\s+for\s+(\d+)/i);
  if (ratingMatch) rating = parseInt(ratingMatch[1], 10);

  // Alternative: meta or data attributes
  if (rating == null) {
    $('[data-rating], [data-difficulty]').each((_, el) => {
      const r = $(el).attr('data-rating') || $(el).attr('data-difficulty');
      if (r && /^\d+$/.test(r)) rating = parseInt(r, 10);
    });
  }

  return { problemCode, title, rating, link: url };
}

/**
 * Full pipeline: get contest list, then for each contest get problems, then for each problem get metadata.
 * Deduplicates by problem code and caches result.
 */
async function scrapeAll(options = {}) {
  const { contestLimit = 8, delayMs = 800 } = options;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const contestCodes = await scrapeContestList(contestLimit);
  const problemCodeToMeta = new Map();

  for (const contestCode of contestCodes) {
    await delay(delayMs);
    let codes = [];
    try {
      codes = await scrapeProblemCodesFromContest(contestCode);
    } catch (e) {
      console.warn(`Contest ${contestCode}: ${e.message}`);
      continue;
    }
    for (const code of codes) {
      if (problemCodeToMeta.has(code)) continue;
      await delay(delayMs);
      try {
        const meta = await scrapeProblemMetadata(code);
        problemCodeToMeta.set(code, { ...meta, contestCode: contestCode });
      } catch (e) {
        console.warn(`Problem ${code}: ${e.message}`);
      }
    }
  }

  const list = Array.from(problemCodeToMeta.values());
  const result = { problems: list, updatedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write cache:', e.message);
  }
  return result;
}

/** Load from cache if exists and return; otherwise return null */
function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  scrapeAll,
  loadCache,
  scrapeContestList,
  scrapeProblemCodesFromContest,
  scrapeProblemMetadata,
};
