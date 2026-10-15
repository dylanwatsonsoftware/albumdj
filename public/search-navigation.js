import { buildSearchHash, writeNavigationHistory } from "./navigation.js";

// One owner for search results: navigating away invalidates pending requests.
export function createSearchNavigation({ history, location, load, onQuery, onResults, onError, onLoading, onClear }) {
  let revision = 0;
  return {
    async show(query, { updateHash = true } = {}) {
      query = query.trim();
      if (!query) return;
      const current = ++revision;
      const hash = buildSearchHash(query);
      if (updateHash && location.hash !== hash) writeNavigationHistory(history, hash);
      onQuery(query);
      onLoading(true);
      try {
        const results = await load(query);
        if (current === revision) onResults(results, query);
      } catch (error) {
        if (current === revision) onError(error);
      } finally {
        if (current === revision) onLoading(false);
      }
    },
    reset() {
      revision += 1;
      onLoading(false);
      onClear();
    },
  };
}
