import type { Metadata } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://football-match-maker.b-thitikorn.chatgpt.site';
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
        url: publicAsset('/og.png?v=20260910-multi'),
        width: 1672,
        height: 941,
        alt: 'Football Match Maker tactical board',
      },
      {
        url: publicAsset('/og-classic.png?v=20260910-multi'),
        width: 1672,
        height: 941,
        alt: 'Football Match Maker classic stadium',
      },
      {
        url: publicAsset('/og-dynamic.png?v=20260910-multi'),
        width: 1672,
        height: 941,
        alt: 'Football Match Maker dynamic match',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Match Maker',
    description: 'จัดทีม • จัดตาราง • หมุนเวียน GK',
    images: [publicAsset('/og.png?v=20260910-multi')],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <link
          rel="preconnect"
          href="https://ep-falling-night-b3rsao2f.apirest.c-4.ap-southeast-1.aws.neon.tech"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
