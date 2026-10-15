# Release readiness — 15 October 2026

## Verified

- Original checkout was clean at `b93a59aff30bf8db9e1e5c618b7f4d310f6db48a`.
- A live, read-only `git ls-remote` returned the same commit for GitHub `main`.
  The previously reported four unpushed commits have already reached main.
- Public `https://albumdj.vercel.app/app.js` matched the original checkout
  byte-for-byte (SHA-256 `eb9da50ab27fd6db322c535294f67dd4e2d1734bcb27b7b161d1a16106cbe91e`).
- The deployed `optimistic-action.js` also matched byte-for-byte (SHA-256
  `68590e349d0c01691c41054ecb2b9c61a1d314276e6cb7fc9d17a54cf7121ca6`).
  The recent web optimistic actions are already publicly served.
- This change adds `#search?q=...` routes, restores direct links, preserves
  browser Back/Forward navigation, and prevents stale asynchronous searches
  from replacing results after another search or navigation.
- Node 22.22.0: all 167 tests passed, including HTTP server tests, search
  navigation, race regressions, account isolation, playback, and NFC tests.
  The sandbox initially blocked HTTP loopback binding; rerunning with that
  permission passed. `node --check public/app.js` and `git diff --check` passed.

## Scope and remaining verification

No remote pushes, deployments, authenticated Spotify calls, account mutations,
or Android changes were performed. Public JavaScript comparisons do not prove
which server build is deployed or verify authenticated playback behavior.
No authenticated browser session or physical Android smoke test was run.
Android was not rebuilt because this change affects only web routes.

## Pending release steps

1. Review and integrate this local commit into the source checkout (cherry-pick
   from this isolated repository, or apply its diff). The original checkout
   remains unchanged.
2. In a connected browser, search for two terms; open an artist from results;
   use Back and Forward; open a copied search URL in another tab; check loading,
   error/retry, and empty results. Confirm the recipient uses their own account.
3. Push the reviewed commit through the normal repository workflow and confirm
   the Vercel deployment succeeds. This document does not authorize publishing.
4. Smoke-test the deployed search route and verify `search-navigation.js` is
   served. Verify stack/favourite behavior and playback with a connected Spotify
   account if this is the release acceptance gate.
