import Link from 'next/link';
import type { ReactNode } from 'react';

export type PolycoreNavLink = {
  href: string;
  label: string;
};

export const DEFAULT_NAV_LINKS: PolycoreNavLink[] = [
  { href: '/', label: 'Overview' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/monitor', label: 'Monitor' },
  { href: '/rules', label: 'Rules' },
  { href: 'https://github.com/Lurk-AI-INC/polycore', label: 'GitHub' },
];

type PolycoreShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerTitle?: string;
  footerCopy?: string;
  navLinks?: PolycoreNavLink[];
};

function renderNavLink(link: PolycoreNavLink) {
  return (
    <Link key={`${link.href}:${link.label}`} className="secondary-button" href={link.href}>
      {link.label}
    </Link>
  );
}

export function PolycoreShell({
  title,
  subtitle,
  children,
  footerTitle = 'Fast tooling for market workflows.',
  footerCopy = 'Calculator, watchlists, monitor, rules, and CLI.',
  navLinks = DEFAULT_NAV_LINKS,
}: PolycoreShellProps) {
  return (
    <div className="page-frame">
      <div className="topbar panel-surface">
        <div className="brand-lockup">
          <div className="brand-mark">PC</div>
          <div>
            <p className="eyebrow">Open-source, local-first market toolkit by Lurk</p>
            <div className="brand-line">
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
        </div>
        <div className="topbar-actions">{navLinks.map(renderNavLink)}</div>
      </div>

      {children}

      <footer className="footer panel-surface">
        <div className="footer-main">
          <div>
            <p className="eyebrow">PolyCore</p>
            <h2>{footerTitle}</h2>
            <p className="section-copy footer-copy">{footerCopy}</p>
          </div>
          <div className="footer-links">{navLinks.map(renderNavLink)}</div>
        </div>
      </footer>
    </div>
  );
}
