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
  return getNavigationState(hash.replace(/^#/, "")).activeSection;
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
