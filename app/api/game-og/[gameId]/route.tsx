import { ImageResponse } from 'next/og';
import { loadSharedGame } from '@/lib/football-data-api';
import { TEAM_COLOR_HEX, gameDateLabel } from '@/lib/game-share';
import antonFontUrl from '@/public/fonts/Anton-Regular.ttf?inline';
import backgroundUrl from '@/public/game-og-stadium-bg.png?inline';
import boldFontUrl from '@/public/fonts/NotoSansThai-Bold.ttf?inline';
import regularFontUrl from '@/public/fonts/NotoSansThai-Regular.ttf?inline';

type GameImageRouteContext = {
  params: Promise<{ gameId: string }>;
};

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 630;

function displayGameName(name: string) {
  const characters = Array.from(name.trim());
  if (characters.length <= 52) return characters.join('');
  return `${characters.slice(0, 49).join('')}…`;
}

function gameNameSize(name: string) {
  const length = Array.from(name).length;
  if (length <= 18) return 50;
  if (length <= 30) return 43;
  return 35;
}

function dataUrlToArrayBuffer(dataUrl: string) {
  const marker = ';base64,';
  const markerIndex = dataUrl.indexOf(marker);
  if (markerIndex < 0) throw new Error('Expected an inline base64 asset');
  const binary = atob(dataUrl.slice(markerIndex + marker.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function CalendarIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
      <rect
        x="4"
        y="6"
        width="26"
        height="24"
        rx="2"
        stroke="white"
        strokeWidth="3"
      />
      <path d="M4 13H30M10 3V9M24 3V9" stroke="white" strokeWidth="3" />
      <path
        d="M10 18H13M16 18H19M22 18H25M10 24H13M16 24H19M22 24H25"
        stroke="white"
        strokeWidth="3"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <circle cx="19" cy="19" r="15" stroke="white" strokeWidth="3" />
      <path
        d="M19 10V20L26 24"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function GET(_request: Request, context: GameImageRouteContext) {
  const { gameId } = await context.params;
  const game = await loadSharedGame(gameId).catch(() => null);
  if (!game)
    return new Response('Game not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

  const regularFont = dataUrlToArrayBuffer(regularFontUrl);
  const boldFont = dataUrlToArrayBuffer(boldFontUrl);
  const antonFont = dataUrlToArrayBuffer(antonFontUrl);
  const tournament = game.state;
  const teamCount = tournament.teams.length;
  const matchCount = tournament.matches.length;
  const fieldCount = tournament.numberOfFields;
  const gameName = displayGameName(tournament.name);

  return new ImageResponse(
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
      {/* oxlint-disable-next-line next/no-img-element -- ImageResponse requires a raw image element. */}
      <img
        alt=""
        src={backgroundUrl}
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
            'linear-gradient(90deg, rgba(3,15,31,.05) 0%, rgba(3,15,31,.56) 25%, rgba(3,15,31,.72) 50%, rgba(3,15,31,.56) 75%, rgba(3,15,31,.05) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 42,
          left: 220,
          width: 760,
          height: 560,
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 640,
            height: 150,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f5f7f8',
            fontFamily: 'Anton',
            fontSize: 134,
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
              top: 40,
              left: -8,
              width: 656,
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
              bottom: 3,
              left: -8,
              width: 656,
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
            width: 720,
            minHeight: 72,
            marginTop: 7,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: gameNameSize(gameName),
            fontWeight: 700,
            lineHeight: 1.15,
            textShadow: '0 4px 20px rgba(0,0,0,.8)',
          }}
        >
          {gameName}
        </div>

        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 720,
            height: 58,
            marginTop: 5,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 28,
              left: 0,
              width: 720,
              height: 1,
              background:
                'linear-gradient(90deg, transparent, #71ff69 22%, transparent 39%, transparent 61%, #71ff69 78%, transparent)',
              boxShadow: '0 0 8px 2px rgba(93,255,99,.58)',
            }}
          />
          {tournament.teams.slice(0, 8).map((team) => {
            const color = TEAM_COLOR_HEX[team.color] ?? '#94a3b8';
            return (
              <div
                key={team.id}
                style={{
                  display: 'flex',
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  border: '2px solid rgba(255,255,255,.95)',
                  background: `linear-gradient(145deg, ${color} 0%, ${color} 64%, rgba(0,0,0,.45) 100%)`,
                  boxShadow:
                    '0 0 10px rgba(255,255,255,.2), 0 3px 12px rgba(0,0,0,.6)',
                  zIndex: 1,
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            width: 650,
            height: 64,
            marginTop: 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 360,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
            }}
          >
            <CalendarIcon />
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>
              {gameDateLabel(gameId, tournament)}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              width: 2,
              height: 48,
              background: '#c6ff70',
              boxShadow: '0 0 8px rgba(114,255,99,.4)',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 270,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
            }}
          >
            <ClockIcon />
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>
              {tournament.startTime} น.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            minWidth: 390,
            height: 50,
            marginTop: 10,
            padding: '0 38px',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #75ef66',
            borderRadius: 999,
            background: 'rgba(3,15,31,.8)',
            color: '#f4f9ff',
            fontSize: 24,
            fontWeight: 700,
            boxShadow: '0 0 13px rgba(84,255,96,.2)',
          }}
        >
          {teamCount} ทีม&nbsp;&nbsp;•&nbsp;&nbsp;{matchCount}{' '}
          แมตช์&nbsp;&nbsp;•&nbsp;&nbsp;{fieldCount} สนาม
        </div>

        <div
          style={{
            display: 'flex',
            width: 600,
            marginTop: 17,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            color: '#ffffff',
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 78,
              height: 2,
              background: 'linear-gradient(90deg, transparent, #c5ff78)',
            }}
          />
          Football Match Maker
          <div
            style={{
              display: 'flex',
              width: 78,
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
          data: regularFont,
          weight: 400,
          style: 'normal',
        },
        {
          name: 'Noto Sans Thai',
          data: boldFont,
          weight: 700,
          style: 'normal',
        },
        { name: 'Anton', data: antonFont, weight: 400, style: 'normal' },
      ],
      headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' },
    },
  );
}
