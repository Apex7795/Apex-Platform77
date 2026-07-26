import './globals.css';

export const metadata = {
  title: 'Apex Junk Solutions — Lead Platform',
  description: 'Lead tracking, conversion scoring, and prospect outreach for field service businesses.',
  manifest: '/manifest.json',
  // apple-touch-icon isn't picked up from manifest.json by iOS Safari on
  // its own -- this explicit icons.apple entry is what actually makes
  // "Add to Home Screen" use the real icon instead of a screenshot.
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport = {
  themeColor: '#b91c1c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
