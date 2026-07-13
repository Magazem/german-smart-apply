import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { Nav } from '@/components/nav';
import { TrustStrip } from '@/components/trust-strip';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Apply — Germany-first AI job search, built on trust',
  description:
    'Trusted, deduplicated German job listings with approval-first applications. No blind auto-apply, ever.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Nav />
          <TrustStrip />
          <main>{children}</main>
          <footer style={{ borderTop: '1px solid var(--color-border)', marginTop: 64 }}>
            <div
              className="container row spread"
              style={{ padding: '24px', fontSize: '0.82rem', flexWrap: 'wrap', gap: 12 }}
            >
              <span className="muted">© 2026 Smart Apply. Germany first, trust always.</span>
              <span className="muted">market-de active · market-fr planned</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
