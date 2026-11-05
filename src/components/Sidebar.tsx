import { useEffect, useRef, useState } from 'react';
import { Icon, icons } from './icons';
import { Button } from './ui';
import { useAuth } from '../lib/auth';
import { initials, startProposal } from '../lib/proposals';
import { useStore } from '../lib/store';
import { go, useRoute } from '../lib/router';

// `sections` are the route prefixes that highlight each item; items without a path aren't built yet.
const NAV = [
  { label: 'Home', icon: icons.navHome, path: '/home', sections: ['home'] },
  { label: 'Proposals', icon: icons.navProposals, activeIcon: icons.navProposalsActive, path: '/proposals', sections: ['proposals', 'match'] },
  { label: 'Knowledge pool', icon: icons.navKnowledgeIdle, activeIcon: icons.navKnowledge, path: '/pool/proposals', sections: ['pool', 'add', 'case-studies'] },
  { label: 'Rate card & rules', icon: icons.navRateCard },
  { label: 'Settings', icon: icons.navSettings },
];

export function Sidebar() {
  const { notify } = useStore();
  const { parts } = useRoute();
  const { email, signOut } = useAuth();
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const local = email.split('@')[0];
  const name = local.charAt(0).toUpperCase() + local.slice(1);

  return (
    <aside className="sidebar">
      <div className="sidebar-product">
        <div className="sidebar-mark" />
        <span>Commercial Assistant</span>
      </div>
      <Button className="w-full" onClick={() => startProposal(initials(email)).catch(() => notify('Couldn’t start a proposal. Try again.'))}>
        +&nbsp;&nbsp;New proposal
      </Button>
      <div style={{ height: 12 }} />
      <nav className="sidebar-nav">
        {NAV.map((n) => {
          const active = n.sections?.includes(parts[0] || 'home') ?? false;
          return (
            <button
              key={n.label}
              className={`nav-item${active ? ' is-active' : ''}`}
              onClick={n.path ? () => go(n.path) : () => setComingSoon(n.label)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon src={(active && n.activeIcon) || n.icon} size={20} />
              <span>{n.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-user">
        <div className="avatar">{name.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0">
          <div className="sidebar-user-name">{name}</div>
          <button type="button" className="sidebar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
      {comingSoon && <ComingSoon feature={comingSoon} onClose={() => setComingSoon(null)} />}
    </aside>
  );
}

function ComingSoon({ feature, onClose }: { feature: string; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="coming-soon-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="coming-soon-title">{feature} isn’t ready yet</h2>
        <p className="lh-18">We’re still building this part of Commercial Assistant. It’ll appear here once it’s ready.</p>
        <div className="row-end">
          <div className="flex-1" />
          {/* Plain button so focus can land on it; Button doesn't forward refs. */}
          <button ref={okRef} type="button" className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
