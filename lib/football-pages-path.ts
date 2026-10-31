export const PAGES_PATH_PARAM = '__football_path';

// Redirect hints are untrusted URLs. Only app-owned routes may be restored;
// replaceState removes the temporary query and keeps the public clean path.
export function validPagesPath(value: string | null, basePath: string) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return null;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) < 32) return null;
  const origin = 'https://football.invalid';
  const url = new URL(value, origin);
  const root = `${basePath.replace(/\/+$/, '')}/`;
  if (url.origin !== origin || !url.pathname.startsWith(root)) return null;
  const segment = url.pathname.slice(root.length);
  if (!/^(?:game\d{8}-[1-9]\d*|allgames|latest)\/?$/.test(segment)) return null;
  url.searchParams.delete(PAGES_PATH_PARAM);
  return url.pathname + url.search + url.hash;
}
