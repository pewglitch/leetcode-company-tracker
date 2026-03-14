/**
 * CodeChef data: uses official API (contest list → division contests → problems).
 * Rating is inferred from division when available. Results cached to avoid repeated calls.
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'codechef-problems.json');
const BASE = 'https://www.codechef.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultFetchOptions = {
  headers: { 'User-Agent': USER_AGENT },
  redirect: 'follow',
};

/** Fetch JSON from CodeChef API */
async function fetchJson(url) {
  const res = await fetch(url, defaultFetchOptions);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

// Division → approximate rating (middle of band). CodeChef: Div 4 (0–1399), Div 3 (1400–1599), Div 2 (1600–1999), Div 1 (2000+)
const DIVISION_RATING = {
  div_4: 1200,
  div_3: 1500,
  div_2: 1800,
  div_1: 2200,
};

// Past contest codes (parent or division). API returns problems from division contests.
const FALLBACK_CONTEST_CODES = [
  'START139', 'START138', 'START137', 'START136', 'START135',
  'LTIME119', 'LTIME118', 'LTIME117', 'LTIME116',
  'COOK158', 'COOK157', 'COOK156', 'COOK155',
];

/**
 * Get list of contest codes to process (parent codes like START139, LTIME119).
 */
function getContestList(limit = 15) {
  return FALLBACK_CONTEST_CODES.slice(0, limit);
}

/**
 * Fetch contest details from API. Returns { child_contests?, problems? }.
 */
async function fetchContest(contestCode) {
  const url = `${BASE}/api/contests/${contestCode}`;
  const data = await fetchJson(url);
  if (data.status !== 'success') throw new Error(data.message || 'Contest fetch failed');
  return data;
}

/**
 * Extract problems from contest API response and optional division for rating.
 * problems is object: { CODE: { code, name, problem_url }, ... }
 */
function problemsFromContestResponse(data, contestCode, divisionRating = null) {
  const problems = data.problems;
  if (!problems || typeof problems !== 'object') return [];
  const list = [];
  for (const key of Object.keys(problems)) {
    const p = problems[key];
    if (!p || !p.code) continue;
    const link = p.problem_url ? `${BASE}${p.problem_url}` : `${BASE}/problems/${p.code}`;
    list.push({
      problemCode: p.code,
      title: p.name || p.code,
      link,
      rating: divisionRating,
      contestCode,
    });
  }
  return list;
}

/**
 * Fetch all problems from a contest: if parent has child_contests, fetch each division;
 * otherwise use contest's problems directly.
 */
async function fetchProblemsFromContest(contestCode, delayMs = 300) {
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const data = await fetchContest(contestCode);
  const collected = [];
  const seen = new Set();

  if (data.child_contests && typeof data.child_contests === 'object') {
    const children = data.child_contests;
    for (const divKey of ['div_1', 'div_2', 'div_3', 'div_4']) {
      const child = children[divKey];
      if (!child || !child.contest_code) continue;
      await delay(delayMs);
      let childData;
      try {
        childData = await fetchContest(child.contest_code);
      } catch (e) {
        console.warn(`  ${child.contest_code}: ${e.message}`);
        continue;
      }
      const rating = DIVISION_RATING[divKey] ?? null;
      const list = problemsFromContestResponse(childData, child.contest_code, rating);
      for (const p of list) {
        if (!seen.has(p.problemCode)) {
          seen.add(p.problemCode);
          collected.push(p);
        }
      }
    }
  } else if (data.problems && typeof data.problems === 'object') {
    const list = problemsFromContestResponse(data, contestCode, null);
    for (const p of list) {
      if (!seen.has(p.problemCode)) {
        seen.add(p.problemCode);
        collected.push(p);
      }
    }
  }

  return collected;
}

/**
 * Full pipeline: get contest list, for each contest fetch problems via API, dedupe by problem code, cache.
 */
async function scrapeAll(options = {}) {
  const { contestLimit = 12, delayMs = 400 } = options;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const contestCodes = getContestList(contestLimit);
  const problemByCode = new Map();

  for (const contestCode of contestCodes) {
    await delay(delayMs);
    try {
      const list = await fetchProblemsFromContest(contestCode, delayMs);
      for (const p of list) {
        if (!problemByCode.has(p.problemCode)) {
          problemByCode.set(p.problemCode, p);
        }
      }
    } catch (e) {
      console.warn(`Contest ${contestCode}: ${e.message}`);
    }
  }

  const problems = Array.from(problemByCode.values());
  const result = { problems, updatedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not write cache:', e.message);
  }
  return result;
}

/** Load from cache if exists */
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
  getContestList,
  fetchContest,
  fetchProblemsFromContest,
};
