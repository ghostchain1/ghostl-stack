import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Ghost Compliance',
  description: 'Global compliance control plane for GhostChain'
};

const navItems = [
  { href: '/compliance/overview', label: 'Overview' },
  { href: '/compliance/decisions', label: 'Decisions' },
  { href: '/compliance/policies', label: 'Policies' },
  { href: '/compliance/laws', label: 'Laws' },
  { href: '/compliance/predictions', label: 'Predictions' },
  { href: '/compliance/evidence', label: 'Evidence' },
  { href: '/compliance/controls', label: 'Controls' }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="logo">Ghost Compliance</div>
            <nav className="nav">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="main">
            <div className="content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
