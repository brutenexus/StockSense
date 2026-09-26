'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Bell,
  ChevronDown,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { TYPE_META, type DocumentType } from '@/lib/domain/constants';
import { Avatar, Badge, Button, cx, IconButton, Spinner } from '@/components/ui/primitives';
import { Dropdown, MenuItem } from '@/components/ui/overlay';
import { Logo } from '@/components/app/logo';
import { useToast } from '@/components/ui/toast';
import { ThemeToggle } from './theme-toggle';

export type ShellUser = {
  id: string;
  name: string;
  role: string;
  loginId: string;
  accent: string;
  jobTitle: string | null;
  email: string;
};

export type ShellNotification = {
  id: string;
  kind: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: number;
  createdAt: string;
};

type PendingCounts = Record<DocumentType, number>;

const OPERATIONS: { type: DocumentType; icon: ReactNode }[] = [
  { type: 'RECEIPT', icon: <ArrowDownToLine size={15} /> },
  { type: 'DELIVERY', icon: <ArrowUpFromLine size={15} /> },
  { type: 'TRANSFER', icon: <ArrowLeftRight size={15} /> },
  { type: 'ADJUSTMENT', icon: <SlidersHorizontal size={15} /> },
];

export function AppShell({
  user,
  pending,
  notifications,
  unread,
  children,
}: {
  user: ShellUser;
  pending: PendingCounts;
  notifications: ShellNotification[];
  unread: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(pathname.startsWith('/operations'));

  function linkClass(active: boolean) {
    return cx(
      'focus-ring group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
      active
        ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-900'
        : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
    );
  }

  function badgeClass(active: boolean) {
    return cx(
      'tnum ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold',
      active ? 'bg-white/20 text-white dark:bg-ink-900/15 dark:text-ink-900' : 'bg-ink-200/80 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    );
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <Link href="/dashboard" className={linkClass(pathname === '/dashboard')} onClick={() => setDrawer(false)}>
        <LayoutDashboard size={15} />
        Dashboard
      </Link>

      <div>
        <button
          type="button"
          onClick={() => setOperationsOpen((value) => !value)}
          className={cx(linkClass(false), 'w-full')}
        >
          <ClipboardList size={15} />
          Operations
          <ChevronDown size={14} className={cx('ml-auto transition-transform', operationsOpen && 'rotate-180')} />
        </button>
        {operationsOpen ? (
          <div className="mt-1 space-y-1 border-l border-ink-200 pl-2.5 dark:border-ink-800">
            {OPERATIONS.map(({ type, icon }) => {
              const href = TYPE_META[type].href;
              const active = pathname.startsWith(href);
              return (
                <Link key={type} href={href} className={cx(linkClass(active), 'py-1.5')} onClick={() => setDrawer(false)}>
                  {icon}
                  <span className="truncate">{TYPE_META[type].plural}</span>
                  {pending[type] ? <span className={badgeClass(active)}>{pending[type]}</span> : null}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>

      <Link href="/products" className={linkClass(pathname.startsWith('/products'))} onClick={() => setDrawer(false)}>
        <Package size={15} />
        Products
      </Link>
      <Link href="/moves" className={linkClass(pathname.startsWith('/moves'))} onClick={() => setDrawer(false)}>
        <History size={15} />
        Move History
      </Link>
      <Link href="/settings/warehouses" className={linkClass(pathname.startsWith('/settings'))} onClick={() => setDrawer(false)}>
        <Settings size={15} />
        Settings
      </Link>
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
      <Logo size={36} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
      <span>
        <span className="block text-[14.5px] font-semibold tracking-tight text-ink-900 dark:text-white">StockSense</span>
        <span className="block text-[11px] text-ink-400">Inventory ledger</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-ink-50 dark:bg-ink-950">
      {/* ------------------------------------------------------------ sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 flex-col border-r border-ink-200 bg-white lg:flex dark:border-ink-800 dark:bg-ink-900/60">
        {brand}
        {nav}
        <div className="border-t border-ink-200 p-3 dark:border-ink-800">
          <QuickCreate />
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 p-2 dark:bg-ink-800/60">
            <Avatar name={user.name} accent={user.accent} size={30} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">{user.name}</p>
              <p className="truncate text-[11px] text-ink-400">{user.role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------- mobile drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
          <aside className="relative z-10 flex h-full w-[270px] flex-col border-r border-ink-200 bg-white animate-[rise_0.2s_ease-out] dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center justify-between pr-2">
              {brand}
              <IconButton label="Close" onClick={() => setDrawer(false)}>
                <X size={17} />
              </IconButton>
            </div>
            {nav}
            <div className="border-t border-ink-200 p-3 dark:border-ink-800">
              <QuickCreate />
            </div>
          </aside>
        </div>
      ) : null}

      {/* -------------------------------------------------------------- column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ink-200 bg-white/85 px-3 backdrop-blur lg:px-6 dark:border-ink-800 dark:bg-ink-950/80">
          <IconButton label="Open navigation" className="lg:hidden" onClick={() => setDrawer(true)}>
            <Menu size={18} />
          </IconButton>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5">
            <Link href="/products?new=1" className="hidden sm:block">
              <Button size="sm" variant="outline" icon={<Plus size={14} />}>
                Product
              </Button>
            </Link>
            <NotificationBell notifications={notifications} unread={unread} />
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ search */

function GlobalSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');

  return (
    <form
      className="relative w-full max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const term = value.trim();
        router.push(term ? `/products?q=${encodeURIComponent(term)}` : '/products');
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search products, SKUs, references…"
        aria-label="Search"
        className="focus-ring h-9.5 w-full rounded-lg border border-ink-200 bg-ink-50 pl-8.5 pr-3 text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-brand-400 focus:bg-white dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:focus:bg-ink-900"
      />
    </form>
  );
}

/* ----------------------------------------------------------- quick create */

function QuickCreate() {
  return (
    <Dropdown
      align="left"
      trigger={({ toggle }) => (
        <Button size="sm" className="w-full" icon={<Plus size={15} />} onClick={toggle}>
          Create document
        </Button>
      )}
    >
      {({ close }) => (
        <>
          {OPERATIONS.map(({ type, icon }) => (
            <Link key={type} href={`${TYPE_META[type].href}?new=1`} onClick={close}>
              <MenuItem icon={icon} hint={TYPE_META[type].refCode}>
                {TYPE_META[type].label}
              </MenuItem>
            </Link>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/* --------------------------------------------------------------- bell */

function NotificationBell({ notifications, unread }: { notifications: ShellNotification[]; unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    try {
      await api('/api/notifications', { body: { action: 'read-all' } });
      router.refresh();
    } catch (error) {
      toast.error('Could not update notifications', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function open(notification: ShellNotification) {
    try {
      if (!notification.isRead) await api('/api/notifications', { body: { action: 'read', id: notification.id } });
    } catch {
      /* a failed read-receipt should never block navigation */
    }
    const href = notificationHref(notification);
    if (href) router.push(href);
    router.refresh();
  }

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <IconButton label="Notifications" onClick={toggle} className="relative">
          <Bell size={17} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </IconButton>
      )}
      className="w-[340px]"
    >
      {({ close }) => (
        <div>
          <div className="flex items-center justify-between px-2.5 py-2">
            <p className="text-[12.5px] font-semibold text-ink-800 dark:text-ink-100">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              disabled={busy || unread === 0}
              className="focus-ring rounded text-[11.5px] font-medium text-brand-600 disabled:text-ink-300 dark:text-brand-400 dark:disabled:text-ink-600"
            >
              {busy ? 'Marking…' : 'Mark all read'}
            </button>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12.5px] text-ink-400">You are all caught up.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    close();
                    void open(notification);
                  }}
                  className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <span
                    className={cx(
                      'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                      notification.severity === 'CRITICAL' ? 'bg-rose-500' : notification.severity === 'WARNING' ? 'bg-amber-500' : 'bg-sky-500',
                      notification.isRead && 'opacity-30',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[12.5px]', notification.isRead ? 'font-medium text-ink-600 dark:text-ink-300' : 'font-semibold text-ink-900 dark:text-white')}>
                      {notification.title}
                    </span>
                    {notification.body ? <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-500 dark:text-ink-400">{notification.body}</span> : null}
                    <span className="mt-1 block text-[11px] text-ink-400">{relativeTime(notification.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-ink-200 px-2.5 py-2 dark:border-ink-800">
            <Link href="/settings/activity" onClick={close} className="focus-ring block rounded text-[12px] font-medium text-brand-600 dark:text-brand-400">
              View activity log
            </Link>
          </div>
        </div>
      )}
    </Dropdown>
  );
}

function notificationHref(notification: ShellNotification): string | null {
  if (!notification.entityId) return null;
  if (notification.entityType === 'product') return `/products/${notification.entityId}`;
  if (notification.entityType === 'document') return `/operations/find/${notification.entityId}`;
  return null;
}

/* ------------------------------------------------------------ user menu */

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await api('/api/auth/logout', { body: {} });
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="focus-ring flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
          aria-label="Account menu"
        >
          <Avatar name={user.name} accent={user.accent} size={28} />
          <ChevronDown size={14} className="text-ink-400" />
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <div className="px-2.5 py-2">
            <p className="text-[13px] font-semibold text-ink-900 dark:text-white">{user.name}</p>
            <p className="text-[11.5px] text-ink-500 dark:text-ink-400">{user.email}</p>
            <Badge tone="brand" className="mt-1.5">
              {user.role === 'MANAGER' ? 'Inventory Manager' : 'Warehouse Staff'}
            </Badge>
          </div>
          <div className="my-1 h-px bg-ink-200 dark:bg-ink-800" />
          <Link href="/settings/users" onClick={close}>
            <MenuItem icon={<UserPlus size={15} />}>Team &amp; access</MenuItem>
          </Link>
          <Link href="/settings/warehouses" onClick={close}>
            <MenuItem icon={<Settings size={15} />}>Settings</MenuItem>
          </Link>
          <div className="my-1 h-px bg-ink-200 dark:bg-ink-800" />
          <MenuItem icon={busy ? <Spinner size={15} /> : <LogOut size={15} />} tone="danger" onClick={signOut} disabled={busy}>
            Sign out
          </MenuItem>
        </div>
      )}
    </Dropdown>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <IconButton
      label="Sign out"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api('/api/auth/logout', { body: {} });
          router.replace('/login');
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner size={15} /> : <LogOut size={15} />}
    </IconButton>
  );
}
