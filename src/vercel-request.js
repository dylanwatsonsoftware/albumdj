export function restoreVercelApiPath(requestUrl) {
  const url = new URL(requestUrl, "https://albumdj.local");
  const route = url.searchParams.get("route");
  if (!route) return `${url.pathname}${url.search}`;
  url.searchParams.delete("route");
  const query = url.searchParams.toString();
  return `/api/${route}${query ? `?${query}` : ""}`;
}
