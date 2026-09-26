import type { Metadata } from 'next';
import { KeyRound, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { listSessions, listUsers } from '@/lib/repo/users';
import { recentActivityCounters } from '@/lib/repo/activity';
import { requireUser } from '@/lib/auth/server';
import { can, ROLE_META, ROLE_CAPABILITIES } from '@/lib/domain/constants';
import { formatDateTime, relativeTime } from '@/lib/format';
import { Avatar, Badge, PageHeader } from '@/components/ui/primitives';
import { SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { SettingsNav } from '@/components/app/settings-nav';
import { UserForm } from '@/components/app/user-form';

export const metadata: Metadata = { title: 'Team & access' };

export default async function UsersSettingsPage() {
  const user = await requireUser('/settings/users');
  const users = listUsers();
  const canManage = can(user.role, 'manage_users');
  const counters = recentActivityCounters();
  const sessions = listSessions(user.id).slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Team & access"
        subtitle="Who can sign in, what they are allowed to do, and the sessions they hold right now."
        actions={canManage ? <UserForm selfId={user.id} /> : null}
      />

      <SettingsNav active="users" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Teammates" value={users.length} hint={`${users.filter((entry) => entry.isActive === 1).length} active`} icon={<Users size={16} />} />
        <StatTile
          label="Managers"
          value={users.filter((entry) => entry.role === 'MANAGER').length}
          hint="Full control of products, warehouses and users"
          icon={<ShieldCheck size={16} />}
          accent="violet"
        />
        <StatTile label="Actions today" value={counters.actionsToday} hint="Document and stock activity" icon={<UserCheck size={16} />} accent="emerald" />
        <StatTile label="Active this week" value={counters.usersActive7d} hint="Distinct teammates in the audit log" icon={<KeyRound size={16} />} accent="sky" />
      </div>

      <SectionCard title="Roles" subtitle="Capabilities are enforced on every route, not just in the UI" bodyClassName="grid gap-4 p-5 sm:grid-cols-2">
        {(['MANAGER', 'STAFF'] as const).map((role) => (
          <div key={role} className="rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white">{ROLE_META[role].label}</p>
              <Badge tone={role === 'MANAGER' ? 'violet' : 'neutral'}>{users.filter((entry) => entry.role === role).length} member(s)</Badge>
            </div>
            <p className="mt-1 text-[12px] text-ink-500 dark:text-ink-400">{ROLE_META[role].blurb}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {ROLE_CAPABILITIES[role].map((capability) => (
                <li key={capability}>
                  <Badge tone="neutral">{capability.replace(/_/g, ' ')}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Teammates" subtitle={`${users.length} account(s)`} bodyClassName="">
        <Table minWidth={920}>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Login Id</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Job title</TH>
              <TH align="right">Last sign-in</TH>
              <TH>Status</TH>
              <TH align="right" />
            </tr>
          </THead>
          <TBody>
            {users.map((entry) => (
              <tr key={entry.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                <TD>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={entry.name} accent={entry.accent} size={30} />
                    <div className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink-900 dark:text-white">{entry.name}</span>
                      <span className="block text-[11px] text-ink-400">{entry.phone ?? '—'}</span>
                    </div>
                  </div>
                </TD>
                <TD className="font-mono text-[12px]">{entry.loginId}</TD>
                <TD className="text-[12.5px]">{entry.email}</TD>
                <TD>
                  <Badge tone={entry.role === 'MANAGER' ? 'violet' : 'neutral'}>{entry.role === 'MANAGER' ? 'Manager' : 'Staff'}</Badge>
                </TD>
                <TD className="text-[12.5px]">{entry.jobTitle ?? '—'}</TD>
                <TD align="right" className="text-[12px] text-ink-500 dark:text-ink-400">
                  {entry.lastLoginAt ? relativeTime(entry.lastLoginAt) : 'Never'}
                </TD>
                <TD>{entry.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="danger" dot>Disabled</Badge>}</TD>
                <TD align="right">
                  {canManage ? (
                    <UserForm
                      user={{
                        id: entry.id,
                        name: entry.name,
                        loginId: entry.loginId,
                        email: entry.email,
                        role: entry.role,
                        phone: entry.phone,
                        jobTitle: entry.jobTitle,
                        accent: entry.accent,
                        isActive: entry.isActive,
                      }}
                      selfId={user.id}
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                      triggerSize="xs"
                    />
                  ) : entry.id === user.id ? (
                    <span className="text-[11.5px] text-ink-400">That&apos;s you</span>
                  ) : null}
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      </SectionCard>

      <SectionCard title="Your sessions" subtitle="Devices holding a live session for your account">
        <ul className="space-y-2.5">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5 text-[12.5px] dark:bg-ink-800/50">
              <span className="min-w-0 truncate text-ink-600 dark:text-ink-300">{session.userAgent ?? 'Unknown device'}</span>
              <span className="text-ink-400">
                {session.ip ?? 'local'} · started {formatDateTime(session.createdAt)} · expires {formatDateTime(session.expiresAt)}
              </span>
            </li>
          ))}
          {sessions.length === 0 ? <li className="text-[12.5px] text-ink-400">No live sessions recorded.</li> : null}
        </ul>
      </SectionCard>
    </div>
  );
}
