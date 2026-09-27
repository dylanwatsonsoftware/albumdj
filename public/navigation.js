export const APP_SECTIONS = ["home", "library", "stack", "devices"];
const SECTION_FOCUS_TARGETS = {
  home: ["album-search"],
  library: ["collection-filter", "favourite-artists", "favourite-albums"],
};

export function getNavigationState(section) {
  const activeSection = APP_SECTIONS.includes(section) ? section : "home";
  return {
    activeSection,
    sections: Object.fromEntries(APP_SECTIONS.map((name) => [name, name === activeSection])),
  };
}

export function sectionFromHash(hash) {
  return routeFromHash(hash).section;
}

function safelyDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function routeFromHash(hash) {
  const value = hash.replace(/^#/, "");
  const [path, query = ""] = value.split("?", 2);
  if (path.startsWith("artist/")) {
    const id = safelyDecode(path.slice("artist/".length));
    if (id) {
      const name = new URLSearchParams(query).get("name")?.trim() || "Artist";
      return { section: "home", view: "artist", artist: { id, name } };
    }
  }
  const section = getNavigationState(path).activeSection;
  return { section, view: "section", artist: null };
}

export function buildArtistHash(artist) {
  if (!artist?.id) return "#home";
  const query = new URLSearchParams({ name: artist.name || "Artist" });
  return `#artist/${encodeURIComponent(artist.id)}?${query}`;
}

export function writeNavigationHistory(history, hash, { replace = false, state = {} } = {}) {
  const method = replace ? "replaceState" : "pushState";
  history[method]({ albumDj: true, ...state }, "", hash);
}

export function artistBackAction(historyState) {
  return historyState?.albumDj && historyState.returnHash ? "back" : "home";
}

export function getNavigationIntent(section, focusTarget) {
  const activeSection = getNavigationState(section).activeSection;
  return {
    section: activeSection,
    focusTarget: SECTION_FOCUS_TARGETS[activeSection]?.includes(focusTarget)
      ? focusTarget
      : null,
  };
}
