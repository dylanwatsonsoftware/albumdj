export const APP_SECTIONS = ["home", "library", "stack", "devices"];
const LIBRARY_FOCUS_TARGETS = ["album-search", "favourite-artists"];

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
    focusTarget: activeSection === "library" && LIBRARY_FOCUS_TARGETS.includes(focusTarget)
      ? focusTarget
      : null,
  };
}
