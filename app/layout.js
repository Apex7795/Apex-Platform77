import './globals.css';
import { AuthProvider } from '@/src/context/AuthContext';

export const metadata = {
  title: 'Apex Platform',
  description: 'Lead generation and conversion platform for field services',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
