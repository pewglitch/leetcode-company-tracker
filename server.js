const express = require('express');
const path = require('path');

// For Node 18+ fetch is built-in; for older versions you can uncomment:
// const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

/** Normalize slug for consistent matching (lowercase, trim). */
function normalizeSlug(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

/**
 * POST /api/solved
 * Body: { username: "leetcodeUsername" }
 * Response: { solved: ["two-sum", "reverse-linked-list", ...] }
 *
 * Uses LeetCode GraphQL recentAcSubmissionList (most recent accepted submissions).
 * LeetCode may cap how many are returned; solved status is only from this recent list.
 */
app.post('/api/solved', async (req, res) => {
  const { username } = req.body || {};

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Valid username is required' });
  }

  const graphQLQuery = `
    query recentAcSubmissions($username: String!) {
      recentAcSubmissionList(username: $username, limit: 5000) {
        titleSlug
      }
    }
  `;

  try {
    const lcResponse = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: graphQLQuery,
        variables: { username },
      }),
    });

    if (!lcResponse.ok) {
      return res
        .status(502)
        .json({ error: 'Failed to reach LeetCode', status: lcResponse.status });
    }

    const json = await lcResponse.json();

    const list =
      json?.data?.recentAcSubmissionList && Array.isArray(json.data.recentAcSubmissionList)
        ? json.data.recentAcSubmissionList
        : [];

    const solvedSet = new Set();
    for (const item of list) {
      if (item && typeof item.titleSlug === 'string') {
        const slug = normalizeSlug(item.titleSlug);
        if (slug) solvedSet.add(slug);
      }
    }

    res.json({ solved: Array.from(solvedSet) });
  } catch (err) {
    console.error('Error calling LeetCode GraphQL:', err);
    res.status(500).json({ error: 'Internal server error while fetching from LeetCode' });
  }
});

// Fallback: serve index.html for root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`LeetCode Company Tracker server listening on http://localhost:${PORT}`);
});


