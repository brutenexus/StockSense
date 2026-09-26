import { Boxes, Building2, History, SlidersHorizontal, Tags, Users } from 'lucide-react';
import { LinkTabs } from '@/components/ui/nav';

export const SETTINGS_TABS = [
  { value: 'warehouses', label: 'Warehouses', href: '/settings/warehouses', icon: <Building2 size={14} /> },
  { value: 'users', label: 'Team & access', href: '/settings/users', icon: <Users size={14} /> },
  { value: 'catalog', label: 'Categories & contacts', href: '/settings/catalog', icon: <Tags size={14} /> },
  { value: 'activity', label: 'Activity', href: '/settings/activity', icon: <History size={14} /> },
  { value: 'data', label: 'Data tools', href: '/settings/data', icon: <SlidersHorizontal size={14} /> },
] as const;

export function SettingsNav({ active }: { active: (typeof SETTINGS_TABS)[number]['value'] }) {
  return (
    <LinkTabs
      className="surface p-1.5"
      items={SETTINGS_TABS.map((tab) => ({
        value: tab.value,
        label: tab.label,
        href: tab.href,
        tone: tab.value === active ? 'active' : undefined,
      }))}
    />
  );
}

export { Boxes };
