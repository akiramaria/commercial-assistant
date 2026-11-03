import { Icon, icons } from './icons';
import { Button } from './ui';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { go, useRoute } from '../lib/router';

// `sections` are the route prefixes that highlight each item; items without a path aren't built yet.
const NAV = [
  { label: 'Home', icon: icons.navHome },
  { label: 'Proposals', icon: icons.navProposals, activeIcon: icons.navProposalsActive, path: '/proposals', sections: ['proposals', 'match'] },
  { label: 'Knowledge pool', icon: icons.navKnowledgeIdle, activeIcon: icons.navKnowledge, path: '/pool/proposals', sections: ['pool', 'add', 'case-studies'] },
  { label: 'Rate card & rules', icon: icons.navRateCard },
  { label: 'Settings', icon: icons.navSettings },
];

export function Sidebar() {
  const { notify } = useStore();
  const { parts } = useRoute();
  const { email, signOut } = useAuth();
  const local = email.split('@')[0];
  const name = local.charAt(0).toUpperCase() + local.slice(1);
  const notBuilt = () => notify('Only the Knowledge pool is built so far.');

  return (
    <aside className="sidebar">
      <div className="sidebar-product">
        <div className="sidebar-mark" />
        <span>Commercial Assistant</span>
      </div>
      <Button className="w-full" onClick={notBuilt}>
        +&nbsp;&nbsp;New proposal
      </Button>
      <div style={{ height: 12 }} />
      <nav className="sidebar-nav">
        {NAV.map((n) => {
          const active = n.sections?.includes(parts[0]) ?? false;
          return (
            <button
              key={n.label}
              className={`nav-item${active ? ' is-active' : ''}`}
              onClick={n.path ? () => go(n.path) : notBuilt}
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
    </aside>
  );
}
