import { Icon, icons } from './icons';
import { Button } from './ui';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { go } from '../lib/router';

const NAV = [
  { label: 'Home', icon: icons.navHome },
  { label: 'Proposals', icon: icons.navProposals },
  { label: 'Knowledge pool', icon: icons.navKnowledge, active: true },
  { label: 'Rate card & rules', icon: icons.navRateCard },
  { label: 'Settings', icon: icons.navSettings },
];

export function Sidebar() {
  const { notify } = useStore();
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
        {NAV.map((n) => (
          <button
            key={n.label}
            className={`nav-item${n.active ? ' is-active' : ''}`}
            onClick={n.active ? () => go('/pool/proposals') : notBuilt}
            aria-current={n.active ? 'page' : undefined}
          >
            <Icon src={n.icon} size={20} />
            <span>{n.label}</span>
          </button>
        ))}
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
