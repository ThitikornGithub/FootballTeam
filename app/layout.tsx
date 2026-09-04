import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://football-match-maker.coral-spice-7899.chatgpt.site'),
  title: 'Football Match Maker',
  description: 'จัดตารางฟุตบอลและหมุนเวียนผู้รักษาประตูสำหรับกลุ่มเพื่อน',
  openGraph: {
    title: 'Football Match Maker',
    description: 'จัดทีม • จัดตาราง • หมุนเวียน GK',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Football Match Maker' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Football Match Maker',
    description: 'จัดทีม • จัดตาราง • หมุนเวียน GK',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
