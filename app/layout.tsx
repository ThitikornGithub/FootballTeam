import type { Metadata } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://thitikorngithub.github.io';
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
    description: 'นัดนี้ เจอกันในสนาม • จัดทีม • จัดตาราง • หมุนเวียน GK',
    type: 'website',
    images: [
      {
        url: publicAsset('/og-classic.jpg?v=20260910-single'),
        width: 1200,
        height: 675,
        alt: 'Football Match Maker — จัดทีม จัดตาราง และหมุนเวียนผู้รักษาประตู',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Match Maker',
    description: 'นัดนี้ เจอกันในสนาม • จัดทีม • จัดตาราง • หมุนเวียน GK',
    images: [publicAsset('/og-classic.jpg?v=20260910-single')],
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
