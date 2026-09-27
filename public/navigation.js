export const APP_SECTIONS = ["home", "library", "stack", "devices"];

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
