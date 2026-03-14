let allCompanies = [];
let lastSolvedSlugs = [];
let currentDifficulty = 'all';
const ALL_COMPANIES_KEY = '__ALL__';

async function fetchSolved(username) {
  const response = await fetch('/api/solved', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Backend error: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.solved) ? data.solved : [];
}

async function fetchCompanyData() {
  // Load as text first; your data.bin is base64-encoded JSON.
  const response = await fetch('data.bin');
  if (!response.ok) {
    throw new Error(`Failed to load company dataset: ${response.status}`);
  }

  const raw = await response.text();
  let decodedJson;

  try {
    // Primary path: base64-encoded JSON string
    const decoded = atob(raw.trim());
    decodedJson = JSON.parse(decoded);
  } catch (_) {
    // Fallback: plain JSON
    decodedJson = JSON.parse(raw);
  }

  // If this already looks like our simplified shape (array of companies with problems), return as-is
  if (Array.isArray(decodedJson) && decodedJson.length && decodedJson[0].problems) {
    return decodedJson;
  }

  // Otherwise adapt from the Explorer's structure: { companies: [ { name, totalProblems, files: { tabKey: [problems] } } ] }
  const sourceCompanies = Array.isArray(decodedJson.companies) ? decodedJson.companies : [];

  return sourceCompanies.map((company) => {
    const files = company.files || {};

    // Prefer an explicit all-time list if present;
    // otherwise, build a union of all tabs so counts
    // match the original site's "totalProblems".
    let baseList = Array.isArray(files.allTime) ? files.allTime : [];

    if (!baseList.length) {
      const seenByLink = new Map();
      for (const key in files) {
        const arr = files[key];
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          if (!p || typeof p.link !== 'string') continue;
          if (!seenByLink.has(p.link)) {
            seenByLink.set(p.link, p);
          }
        }
      }
      baseList = Array.from(seenByLink.values());
    }

    const problems = baseList.map((p) => {
      // Derive slug from the LeetCode link if present
      let slug = '';
      if (typeof p.link === 'string') {
        try {
          const url = new URL(p.link);
          // path like /problems/two-sum/ -> take segment after /problems/
          const parts = url.pathname.split('/').filter(Boolean);
          const idx = parts.indexOf('problems');
          if (idx !== -1 && parts[idx + 1]) slug = parts[idx + 1];
        } catch {
          // Fallback: best-effort from raw string
          const match = p.link.match(/problems\/([^\/?#]+)/);
          if (match && match[1]) slug = match[1];
        }
      }

      const difficultyMap = {
        EASY: 'Easy',
        MEDIUM: 'Medium',
        HARD: 'Hard',
      };

      const normDifficulty =
        difficultyMap[p.difficulty] || (p.difficulty ? String(p.difficulty) : 'Unknown');

      return {
        slug,
        title: p.title,
        difficulty: normDifficulty,
        link: p.link,
      };
    });

    return {
      name: company.name,
      problems,
    };
  });
}

function setStatus(message, type = '') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-text${type ? ' ' + type : ''}`;
}

function buildAllCompaniesAggregate() {
  // Combine problems from all companies into a single synthetic "ALL" company.
  const byKey = new Map();

  allCompanies.forEach((company) => {
    (company.problems || []).forEach((p) => {
      if (!p) return;
      const key = p.slug || p.link || p.title;
      if (!key) return;
      if (!byKey.has(key)) {
        byKey.set(key, p);
      }
    });
  });

  return {
    name: 'ALL',
    problems: Array.from(byKey.values()),
  };
}

function normalizeSlug(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

function renderResults(companies, solvedSlugs) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';

  const solvedSet = new Set((solvedSlugs || []).map(normalizeSlug));

  companies.forEach((company) => {
    const card = document.createElement('div');
    card.className = 'company-card';

    const header = document.createElement('div');
    header.className = 'company-header';

    const nameEl = document.createElement('div');
    nameEl.className = 'company-name';
    nameEl.textContent = company.name;

    const metaEl = document.createElement('div');
    metaEl.className = 'company-meta';
    const visibleProblems = company.problems.filter((p) => {
      if (currentDifficulty === 'all') return true;
      return p.difficulty && p.difficulty.toLowerCase() === currentDifficulty;
    });
    const solvedCount = visibleProblems.filter((p) => solvedSet.has(normalizeSlug(p.slug))).length;
    metaEl.textContent = `${solvedCount}/${visibleProblems.length} solved`;

    header.appendChild(nameEl);
    header.appendChild(metaEl);
    card.appendChild(header);

    const table = document.createElement('table');
    table.className = 'problems-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Status</th>
          <th>Title</th>
          <th>Difficulty</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    visibleProblems.forEach((p) => {
      const tr = document.createElement('tr');

      const isSolved = solvedSet.has(normalizeSlug(p.slug));
      const statusCell = document.createElement('td');
      statusCell.innerHTML = `<span class="status-badge ${
        isSolved ? 'solved' : 'unsolved'
      }">${isSolved ? '✔' : '✘'}</span>`;

      const titleCell = document.createElement('td');
      const link = document.createElement('a');
      link.className = 'link';
      link.href = p.link;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = p.title;
      titleCell.appendChild(link);

      const diffCell = document.createElement('td');
      const diffPill = document.createElement('span');
      diffPill.className = `difficulty-pill difficulty-${p.difficulty.toLowerCase()}`;
      diffPill.textContent = p.difficulty;
      diffCell.appendChild(diffPill);

      tr.appendChild(statusCell);
      tr.appendChild(titleCell);
      tr.appendChild(diffCell);

      tbody.appendChild(tr);
    });

    card.appendChild(table);
    container.appendChild(card);
  });
}

function populateCompanySelect(companies) {
  const select = document.getElementById('company-select');
  const diffSelect = document.getElementById('difficulty-select');
  select.innerHTML = '';

  if (!companies.length && !allCompanies.length) {
    select.disabled = true;
    diffSelect.disabled = true;
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No companies available';
    select.appendChild(opt);
    document.getElementById('results-container').innerHTML = '';
    return;
  }

  select.disabled = false;
  diffSelect.disabled = false;

  const allOpt = document.createElement('option');
  allOpt.value = ALL_COMPANIES_KEY;
  allOpt.textContent = 'ALL';
  select.appendChild(allOpt);

  companies.forEach((company) => {
    const opt = document.createElement('option');
    opt.value = company.name;
    opt.textContent = company.name;
    select.appendChild(opt);
  });
}

function renderSelectedCompany() {
  const select = document.getElementById('company-select');
  const name = select.value;

  if (!name || !allCompanies.length) {
    return;
  }

  if (name === ALL_COMPANIES_KEY) {
    const aggregate = buildAllCompaniesAggregate();
    renderResults([aggregate], lastSolvedSlugs);
    return;
  }

  const company = allCompanies.find((c) => c.name === name);
  if (!company) return;

  renderResults([company], lastSolvedSlugs);
}

function applyCompanyFilter() {
  if (!allCompanies.length) return;

  const filterInput = document.getElementById('company-filter');
  const q = filterInput.value.trim().toLowerCase();

  const filtered = q
    ? allCompanies.filter((c) => c.name.toLowerCase().includes(q))
    : allCompanies.slice();

  populateCompanySelect(filtered);

  const select = document.getElementById('company-select');

  if (!filtered.length) {
    // No match for filter; fall back to ALL over full dataset
    select.value = ALL_COMPANIES_KEY;
    const aggregate = buildAllCompaniesAggregate();
    renderResults([aggregate], lastSolvedSlugs);
    return;
  }

  if (q) {
    // When actively filtering, default to first matching company
    select.value = filtered[0].name;
    renderResults([filtered[0]], lastSolvedSlugs);
  } else {
    // Empty filter: show ALL companies
    select.value = ALL_COMPANIES_KEY;
    const aggregate = buildAllCompaniesAggregate();
    renderResults([aggregate], lastSolvedSlugs);
  }
}

async function handleCheck() {
  const usernameInput = document.getElementById('username');
  const username = usernameInput.value.trim();

  if (!username) {
    setStatus('Please enter a LeetCode username.', 'error');
    return;
  }

  setStatus('Fetching latest solved problems from LeetCode…');

  try {
    const [solvedSlugs, companies] = await Promise.all([
      fetchSolved(username),
      fetchCompanyData(),
    ]);

    lastSolvedSlugs = solvedSlugs;
    allCompanies = companies;
    currentDifficulty = 'all';

    if (!solvedSlugs.length) {
      setStatus(
        'No recent accepted submissions found or username might be incorrect. Showing unsolved grid.',
        'error'
      );
    } else {
      setStatus('Comparison complete. Use the company selector to browse.', 'success');
    }

    // Reset company filter input when running a new check
    const companyFilter = document.getElementById('company-filter');
    if (companyFilter) companyFilter.value = '';

    populateCompanySelect(allCompanies);

    if (allCompanies.length) {
      const select = document.getElementById('company-select');
      select.value = ALL_COMPANIES_KEY;
      const aggregate = buildAllCompaniesAggregate();
      renderResults([aggregate], lastSolvedSlugs);
    }
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong. Please try again.', 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('check-btn');
  const input = document.getElementById('username');
  const companyFilter = document.getElementById('company-filter');
  const companySelect = document.getElementById('company-select');
  const difficultySelect = document.getElementById('difficulty-select');

  btn.addEventListener('click', handleCheck);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleCheck();
    }
  });

  companyFilter.addEventListener('input', () => {
    applyCompanyFilter();
  });

  companySelect.addEventListener('change', () => {
    renderSelectedCompany();
  });

  difficultySelect.addEventListener('change', () => {
    currentDifficulty = difficultySelect.value || 'all';
    renderSelectedCompany();
  });
});



