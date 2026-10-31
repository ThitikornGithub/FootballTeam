import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { validPagesPath } from '../lib/football-pages-path';

// Offline artifact check. No requests to Neon or GitHub, and no writes.
const root = resolve('dist/client');
const base = '/FootballTeam';
const index = await readFile(join(root, 'index.html'), 'utf8');
let scripts = 0;
let styles = 0;
for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const url = new URL(match[1], 'https://pages.invalid');
  if (
    !url.pathname.startsWith(`${base}/`) ||
    !/\.(?:js|css|ttf|woff2?|svg|jpe?g|png)$/.test(url.pathname)
  )
    continue;
  const file = join(root, url.pathname.slice(base.length + 1));
  assert((await stat(file)).isFile(), `Missing Pages asset: ${url.pathname}`);
  if (url.pathname.endsWith('.js')) scripts += 1;
  if (url.pathname.endsWith('.css')) styles += 1;
}
assert(
  scripts > 0 && styles > 0,
  'Pages HTML must link scripts and styles with the production base path',
);

function checkRedirect(html: string, path: string) {
  let target = '';
  const original = new URL(path, 'https://pages.invalid');
  const bodies = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .filter((body) => body.includes('location.replace'));
  assert.equal(bodies.length, 1, `One redirect script required: ${path}`);
  runInNewContext(
    bodies[0],
    {
      location: {
        pathname: original.pathname,
        search: original.search,
        hash: original.hash,
        replace: (value: string) => {
          target = value;
        },
      },
      sessionStorage: {
        setItem: () => {
          throw new Error('Storage unavailable');
        },
      },
      encodeURIComponent,
    },
    { timeout: 500 },
  );
  const redirect = new URL(target, original.origin);
  assert.equal(redirect.origin, original.origin);
  assert.equal(redirect.pathname, `${base}/`);
  assert.equal(
    validPagesPath(redirect.searchParams.get('__football_path'), base),
    path,
  );
}

const fallback = await readFile(join(root, '404.html'), 'utf8');
checkRedirect(fallback, `${base}/game20991231-9999?v=pages-check#score`);
for (const segment of ['allgames', 'latest']) {
  const html = await readFile(join(root, segment, 'index.html'), 'utf8');
  checkRedirect(html, `${base}/${segment}/?v=pages-check#score`);
}
const games = (await readdir(root)).filter((name) =>
  /^game\d{8}-[1-9]\d*$/.test(name),
);
assert(games.length > 0, 'No static game entry pages were generated');
for (const game of games) {
  const html = await readFile(join(root, game, 'index.html'), 'utf8');
  checkRedirect(html, `${base}/${game}/?v=pages-check#score`);
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  assert(image, `Missing OG image: ${game}`);
  const imagePath = new URL(image).pathname;
  assert(imagePath.startsWith(`${base}/game-og/`));
  assert((await stat(join(root, imagePath.slice(base.length + 1)))).isFile());
}
console.log(
  `Pages artifact checks passed: ${games.length} game entries, allgames/latest, blocked-storage 404 fallback, OG files and base-path assets (offline).`,
);
