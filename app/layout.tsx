import type { Metadata } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://football-match-maker.b-thitikorn.chatgpt.site';
const publicAsset = (path: string) => `${basePath}${path}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Football Match Maker',
  description: 'จัดตารางฟุตบอลและหมุนเวียนผู้รักษาประตูสำหรับกลุ่มเพื่อน',
  icons: {
    icon: [{ url: publicAsset('/favicon.svg'), type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Football Match Maker',
    description: 'จัดทีม • จัดตาราง • หมุนเวียน GK',
    type: 'website',
    images: [
      {
        url: publicAsset('/og.png'),
        width: 1200,
        height: 630,
        alt: 'Football Match Maker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Match Maker',
    description: 'จัดทีม • จัดตาราง • หมุนเวียน GK',
    images: [publicAsset('/og.png')],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
