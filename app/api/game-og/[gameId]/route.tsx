import { ImageResponse } from 'next/og';
import { loadSharedGame } from '@/lib/football-data-api';
import { TEAM_COLOR_HEX, gameDateLabel } from '@/lib/game-share';

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
  if (length <= 18) return 54;
  if (length <= 30) return 44;
  return 36;
}

async function fetchAsset(request: Request, pathname: string) {
  const response = await fetch(new URL(pathname, request.url));
  if (!response.ok)
    throw new Error(`Unable to load game share asset: ${pathname}`);
  return response.arrayBuffer();
}

export async function GET(request: Request, context: GameImageRouteContext) {
  const { gameId } = await context.params;
  const game = await loadSharedGame(gameId).catch(() => null);
  if (!game)
    return new Response('Game not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });

  const [regularFont, boldFont] = await Promise.all([
    fetchAsset(request, '/fonts/NotoSansThai-Regular.ttf'),
    fetchAsset(request, '/fonts/NotoSansThai-Bold.ttf'),
  ]);
  const backgroundUrl = new URL(
    '/game-og-stadium-bg.png',
    request.url,
  ).toString();
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
      {/* oxlint-disable-next-line next/no-img-element -- ImageResponse renders a server-generated PNG and cannot use next/image. */}
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
            'linear-gradient(90deg, rgba(3,15,31,.12) 0%, rgba(3,15,31,.82) 25%, rgba(3,15,31,.92) 50%, rgba(3,15,31,.82) 75%, rgba(3,15,31,.12) 100%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          width: 600,
          height: 570,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#b9ff57',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 8,
            lineHeight: 1,
          }}
        >
          MATCH DAY
        </div>
        <div
          style={{
            display: 'flex',
            width: 600,
            minHeight: 124,
            marginTop: 22,
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: gameNameSize(gameName),
            fontWeight: 700,
            lineHeight: 1.18,
            textShadow: '0 4px 20px rgba(0,0,0,.55)',
          }}
        >
          {gameName}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 12,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
          }}
        >
          {tournament.teams.slice(0, 8).map((team) => (
            <div
              key={team.id}
              style={{
                display: 'flex',
                width: 30,
                height: 30,
                borderRadius: 999,
                border: '2px solid rgba(255,255,255,.9)',
                background: TEAM_COLOR_HEX[team.color] ?? '#94a3b8',
                boxShadow: '0 2px 12px rgba(0,0,0,.45)',
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            width: 570,
            marginTop: 24,
            alignItems: 'stretch',
            justifyContent: 'center',
            borderTop: '1px solid rgba(185,255,87,.55)',
            borderBottom: '1px solid rgba(185,255,87,.55)',
            background: 'rgba(3,15,31,.46)',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 330,
              padding: '14px 18px',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', color: '#a9b8c8', fontSize: 14 }}>
              DATE
            </div>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 700 }}>
              {gameDateLabel(gameId, tournament)}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              width: 1,
              background: 'rgba(185,255,87,.65)',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 240,
              padding: '14px 18px',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', color: '#a9b8c8', fontSize: 14 }}>
              KICK-OFF
            </div>
            <div style={{ display: 'flex', fontSize: 25, fontWeight: 700 }}>
              {tournament.startTime} น.
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 20,
            padding: '9px 30px',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #75e660',
            borderRadius: 999,
            background: 'rgba(3,15,31,.72)',
            color: '#f4f9ff',
            fontSize: 21,
            fontWeight: 700,
          }}
        >
          {teamCount} ทีม&nbsp;&nbsp;•&nbsp;&nbsp;{matchCount}{' '}
          แมตช์&nbsp;&nbsp;•&nbsp;&nbsp;{fieldCount} สนาม
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            color: '#d7e4ef',
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          Football Match Maker
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
      ],
      headers: {
        'cache-control': 'public, max-age=300, s-maxage=3600',
      },
    },
  );
}
