import type { Metadata } from 'next';
import FootballApp from '@/components/football/football-app';
import { loadSharedGame } from '@/lib/football-data-api';
import {
  GAME_SHARE_ORIGIN,
  gameShareDescription,
  gameShareUrl,
} from '@/lib/game-share';

type SharedGamePageProps = {
  params: Promise<{ gameId: string }>;
};

export const dynamic = 'force-dynamic';

// GitHub Pages keeps serving the static root app. The live share site handles
// arbitrary game IDs at request time.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: SharedGamePageProps): Promise<Metadata> {
  const { gameId } = await params;
  const game = await loadSharedGame(gameId).catch(() => null);
  if (!game) {
    return {
      title: 'ไม่พบเกม | Football Match Maker',
      description: 'เปิดเกมฟุตบอลที่แชร์กับคุณ',
      robots: { index: false, follow: false },
    };
  }

  const description = gameShareDescription(gameId, game.state);
  const imageUrl = `${GAME_SHARE_ORIGIN}/api/game-og/${encodeURIComponent(gameId)}?v=${game.revision}`;
  return {
    metadataBase: new URL(GAME_SHARE_ORIGIN),
    title: `${game.state.name} | Football Match Maker`,
    description,
    alternates: { canonical: gameShareUrl(gameId) },
    robots: { index: false, follow: false },
    openGraph: {
      title: game.state.name,
      description,
      type: 'website',
      url: gameShareUrl(gameId),
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `Match Day: ${game.state.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: game.state.name,
      description,
      images: [imageUrl],
    },
  };
}

export default function SharedGamePage() {
  return <FootballApp />;
}
