import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { listSharedGames } from '../lib/football-data-api';

const SITE_ORIGIN = 'https://thitikorngithub.github.io';
const BASE_PATH = '/FootballTeam';
const OUTPUT_ROOT = join(process.cwd(), 'dist', 'client');
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;
const GAME_ID_PATTERN = /^game\d{8}-\d+$/;
const PREGENERATE_DAYS_BEFORE = 1;
// A link for a date past this window still opens, but a crawler gets the 404
// page and shows no card, so the window is wider than a gap between deploys.
// Numbers per day only need to cover games actually created in one day; every
// extra one is a page that previews a game nobody can open.
const PREGENERATE_DAYS_AFTER = 45;
const PREGENERATE_GAME_NUMBERS_PER_DAY = 12;

type SharpFactory = (input: Buffer) => {
  jpeg(options: { quality: number; chromaSubsampling: string }): {
    toFile(outputPath: string): Promise<unknown>;
  };
};

// Vinext intentionally declares optional Next.js native packages as unknown.
// This script owns Sharp directly, so keep the small API surface typed here.
const sharp = createRequire(import.meta.url)('sharp') as SharpFactory;

const THAI_DATE = new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATE_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function dateFromCode(dateCode: string) {
  if (!/^\d{8}$/.test(dateCode)) return null;
  const date = new Date(
    `${dateCode.slice(0, 4)}-${dateCode.slice(4, 6)}-${dateCode.slice(6, 8)}T12:00:00+07:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromGameId(gameId: string) {
  const match = /^game(\d{8})-[1-9]\d*$/.exec(gameId);
  return match ? dateFromCode(match[1]) : null;
}

function dateCode(date: Date) {
  return DATE_KEY.format(date).replaceAll('-', '');
}

function bangkokDateAtOffset(offset: number) {
  const today = dateFromCode(dateCode(new Date()));
  if (!today) throw new Error('Unable to determine the Bangkok date');
  return new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
}

function calendarIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect
        x="5"
        y="7"
        width="28"
        height="26"
        rx="3"
        stroke="white"
        strokeWidth="3"
      />
      <path d="M5 15H33M12 4V10M26 4V10" stroke="white" strokeWidth="3" />
      <path
        d="M11 21H14M18 21H21M25 21H28M11 27H14M18 27H21M25 27H28"
        stroke="white"
        strokeWidth="3"
      />
    </svg>
  );
}

async function renderImage(
  dateLabel: string,
  outputPath: string,
  assets: {
    background: string;
    regularFont: Buffer;
    boldFont: Buffer;
    antonFont: Buffer;
  },
) {
  const svg = await satori(
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#061a31',
        color: '#ffffff',
        fontFamily: 'Noto Sans Thai',
      }}
    >
      {/* oxlint-disable-next-line next/no-img-element -- Satori renders this into the generated JPEG. */}
      <img
        alt=""
        src={assets.background}
        width={IMAGE_WIDTH}
        height={IMAGE_HEIGHT}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(3,15,31,.08) 0%, rgba(3,15,31,.64) 25%, rgba(3,15,31,.78) 50%, rgba(3,15,31,.64) 75%, rgba(3,15,31,.08) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 38,
          left: 285,
          width: 630,
          height: 555,
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 600,
            height: 142,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f7f8f9',
            fontFamily: 'Anton',
            fontSize: 118,
            fontWeight: 400,
            letterSpacing: 1,
            lineHeight: 1,
            textShadow:
              '0 2px 0 rgba(151,167,181,.95), 0 8px 24px rgba(0,0,0,.78)',
            transform: 'skewX(-5deg)',
          }}
        >
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 38,
              left: 0,
              width: 600,
              height: 1,
              background:
                'linear-gradient(90deg, transparent, rgba(91,247,103,.65) 20%, rgba(91,247,103,.65) 80%, transparent)',
              boxShadow: '0 0 9px 2px rgba(92,255,111,.4)',
            }}
          />
          MATCH DAY
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 4,
              left: 0,
              width: 600,
              height: 2,
              background:
                'linear-gradient(90deg, transparent, #70ff69 18%, #70ff69 82%, transparent)',
              boxShadow: '0 0 11px 3px rgba(81,255,103,.75)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            height: 62,
            marginTop: 5,
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 42,
            fontWeight: 700,
            textShadow: '0 4px 20px rgba(0,0,0,.8)',
          }}
        >
          นัดนี้ เจอกันในสนาม
        </div>

        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 550,
            height: 70,
            marginTop: 3,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 35,
              left: 0,
              width: 550,
              height: 1,
              background:
                'linear-gradient(90deg, transparent, #71ff69 21%, transparent 34%, transparent 66%, #71ff69 79%, transparent)',
              boxShadow: '0 0 8px 2px rgba(93,255,99,.58)',
            }}
          />
          {['#16c965', '#ff3341', '#246bff', '#ffd21f'].map((color) => (
            <div
              key={color}
              style={{
                display: 'flex',
                width: 50,
                height: 50,
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,.95)',
                background: `linear-gradient(145deg, ${color} 0%, ${color} 64%, rgba(0,0,0,.45) 100%)`,
                boxShadow:
                  '0 0 10px rgba(255,255,255,.2), 0 3px 12px rgba(0,0,0,.6)',
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            width: 570,
            height: 70,
            marginTop: 7,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 15,
            fontSize: 31,
            fontWeight: 700,
            textShadow: '0 3px 14px rgba(0,0,0,.8)',
          }}
        >
          {calendarIcon()}
          {dateLabel}
        </div>

        <div
          style={{
            display: 'flex',
            minWidth: 440,
            height: 50,
            marginTop: 12,
            padding: '0 36px',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #75ef66',
            borderRadius: 999,
            background: 'rgba(3,15,31,.8)',
            color: '#f4f9ff',
            fontSize: 23,
            fontWeight: 700,
            boxShadow: '0 0 13px rgba(84,255,96,.2)',
          }}
        >
          จัดทีม • จัดตาราง • พร้อมลงสนาม
        </div>

        <div
          style={{
            display: 'flex',
            width: 570,
            marginTop: 21,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 17,
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 72,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #c5ff78)',
            }}
          />
          Football Match Maker
          <div
            style={{
              display: 'flex',
              width: 72,
              height: 2,
              background: 'linear-gradient(90deg, #c5ff78, transparent)',
            }}
          />
        </div>
      </div>
    </div>,
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
      fonts: [
        {
          name: 'Noto Sans Thai',
          data: assets.regularFont,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Noto Sans Thai',
          data: assets.boldFont,
          weight: 700,
          style: 'normal',
        },
        {
          name: 'Anton',
          data: assets.antonFont,
          weight: 400,
          style: 'normal',
        },
      ],
    },
  );

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);
}

function sharePage(gameId: string, dateLabel: string, imageUrl: string) {
  // Each page is written as <gameId>/index.html, so the address without the
  // trailing slash only 301s here. Point canonical and og:url at what is
  // actually served, for scrapers that do not follow the redirect.
  const pageUrl = `${SITE_ORIGIN}${BASE_PATH}/${encodeURIComponent(gameId)}/`;
  const title = `MATCH DAY • ${dateLabel}`;
  const description = 'นัดนี้ เจอกันในสนาม • เปิดลิงก์เพื่อดูทีมและตารางแข่งขัน';
  const redirectTarget = `${BASE_PATH}/`;

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Football Match Maker</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${escapeHtml(pageUrl)}" />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(pageUrl)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="${IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="MATCH DAY วันที่ ${escapeHtml(dateLabel)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <script>
      try {
        sessionStorage.setItem(
          'football-pages-path',
          location.pathname + location.search + location.hash,
        );
      } catch {}
      location.replace(${JSON.stringify(redirectTarget)});
    </script>
  </head>
  <body>
    <p>กำลังเปิดเกม… <a href="${escapeHtml(redirectTarget)}">ไปที่ Football Match Maker</a></p>
  </body>
</html>
`;
}

function allGamesPage() {
  const pageUrl = `${SITE_ORIGIN}${BASE_PATH}/allgames/`;
  const redirectTarget = `${BASE_PATH}/`;
  const title = 'เกมทั้งหมด';
  const description = 'เปิดดูเกม ตารางคะแนน รายชื่อทีม และผลการแข่งขัน';
  const imageUrl = `${SITE_ORIGIN}${BASE_PATH}/og-classic.jpg?v=20260910-single`;

  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} | Football Match Maker</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${pageUrl}" />
    <meta name="robots" content="noindex, nofollow" />
    <meta property="og:title" content="${title} | Football Match Maker" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${imageUrl}" />
    <script>
      try {
        sessionStorage.setItem(
          'football-pages-path',
          location.pathname + location.search + location.hash,
        );
      } catch {}
      location.replace(${JSON.stringify(redirectTarget)});
    </script>
  </head>
  <body>
    <p>กำลังเปิดเกมทั้งหมด… <a href="${redirectTarget}">ไปที่ Football Match Maker</a></p>
  </body>
</html>
`;
}

async function main() {
  const [background, regularFont, boldFont, antonFont, storedGames] =
    await Promise.all([
      // Lives outside public/ because satori only needs it while this script
      // runs; shipping it would put 1.8 MB on the site that nothing requests.
      readFile(join(process.cwd(), 'assets', 'game-og-stadium-bg.png')).then(
        (value) =>
          `data:image/png;base64,${Buffer.from(value).toString('base64')}`,
      ),
      readFile(
        join(process.cwd(), 'public', 'fonts', 'NotoSansThai-Regular.ttf'),
      ),
      readFile(join(process.cwd(), 'public', 'fonts', 'NotoSansThai-Bold.ttf')),
      readFile(join(process.cwd(), 'public', 'fonts', 'Anton-Regular.ttf')),
      // Continuing without the list would publish a site whose every existing
      // game has lost its share page, while the workflow still reports success.
      listSharedGames({ force: true }).catch((error: unknown) => {
        throw new Error(
          `Unable to load existing games from Neon, refusing to publish share pages without them: ${String(error)}`,
        );
      }),
    ]);

  const imageDirectory = join(OUTPUT_ROOT, 'game-og');
  await mkdir(imageDirectory, { recursive: true });
  const allGamesDirectory = join(OUTPUT_ROOT, 'allgames');
  await mkdir(allGamesDirectory, { recursive: true });
  await writeFile(
    join(allGamesDirectory, 'index.html'),
    allGamesPage(),
    'utf8',
  );
  const gameDates = new Map<string, Date>();

  for (const game of storedGames) {
    const date = dateFromGameId(game.id);
    if (!date) {
      console.warn(`Skipping invalid game id: ${game.id}`);
      continue;
    }
    gameDates.set(game.id, date);
  }

  for (
    let offset = -PREGENERATE_DAYS_BEFORE;
    offset <= PREGENERATE_DAYS_AFTER;
    offset += 1
  ) {
    const date = bangkokDateAtOffset(offset);
    const code = dateCode(date);
    for (
      let number = 1;
      number <= PREGENERATE_GAME_NUMBERS_PER_DAY;
      number += 1
    ) {
      gameDates.set(`game${code}-${number}`, date);
    }
  }

  const renderedDates = new Set<string>();

  for (const [gameId, date] of gameDates) {
    if (!GAME_ID_PATTERN.test(gameId)) continue;
    const dateLabel = THAI_DATE.format(date);
    const dateKey = DATE_KEY.format(date);
    const imageName = `match-day-${dateKey}.jpg`;
    const imagePath = join(imageDirectory, imageName);
    if (!renderedDates.has(dateKey)) {
      await renderImage(dateLabel, imagePath, {
        background,
        regularFont,
        boldFont,
        antonFont,
      });
      renderedDates.add(dateKey);
    }

    const gameDirectory = join(OUTPUT_ROOT, gameId);
    await mkdir(gameDirectory, { recursive: true });
    const imageUrl = `${SITE_ORIGIN}${BASE_PATH}/game-og/${imageName}`;
    await writeFile(
      join(gameDirectory, 'index.html'),
      sharePage(gameId, dateLabel, imageUrl),
      'utf8',
    );
  }

  console.log(
    `Generated ${gameDates.size} game share pages and ${renderedDates.size} dated OG images (${storedGames.length} existing games plus ${PREGENERATE_DAYS_BEFORE + PREGENERATE_DAYS_AFTER + 1} prepared dates).`,
  );
}

await main();
