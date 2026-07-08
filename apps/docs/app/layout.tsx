import { Bricolage_Grotesque, Instrument_Serif } from 'next/font/google';
import Script from 'next/script';
import { Provider } from '@/components/provider';
import './global.css';

const sans = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
        <Script
          src="https://analyitics.apoyoescolarrv.com/script.js"
          data-website-id="7c0aad63-67c3-4007-9772-f44cda8fccf3"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
