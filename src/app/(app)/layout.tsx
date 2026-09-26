import { requireUser } from '@/lib/auth/server';
import { pendingCounts } from '@/lib/repo/documents';
import { listNotifications, unreadNotificationCount } from '@/lib/repo/activity';
import { AppShell } from '@/components/app/shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        role: user.role,
        loginId: user.loginId,
        accent: user.accent,
        jobTitle: user.jobTitle,
        email: user.email,
      }}
      pending={pendingCounts()}
      notifications={listNotifications({ limit: 8 })}
      unread={unreadNotificationCount()}
    >
      {children}
    </AppShell>
  );
}
