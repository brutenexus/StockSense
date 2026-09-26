import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Layers, MapPin, Package } from 'lucide-react';
import { listLocations, listWarehouses } from '@/lib/repo/warehouses';
import { warehouseOverview } from '@/lib/repo/insights';
import { locationUtilisation } from '@/lib/repo/inventory';
import { requireUser } from '@/lib/auth/server';
import { can, type LocationKind } from '@/lib/domain/constants';
import { formatMoney, formatNumber, formatQty } from '@/lib/format';
import { Badge, Button, PageHeader } from '@/components/ui/primitives';
import { LinkTabs } from '@/components/ui/nav';
import { ExportButton, PrintButton } from '@/components/app/filters';
import { MetaGrid, SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { SettingsNav } from '@/components/app/settings-nav';
import { LocationForm } from '@/components/app/location-form';
import { WarehouseForm } from '@/components/app/warehouse-form';

export const metadata: Metadata = { title: 'Warehouses' };

const KIND_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'info' | 'violet'> = {
  INTERNAL: 'neutral',
  INPUT: 'success',
  OUTPUT: 'info',
  PRODUCTION: 'violet',
  TRANSIT: 'warning',
};

export default async function WarehousesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser('/settings/warehouses');
  const params = await searchParams;
  const selectedParam = Array.isArray(params.wh) ? params.wh[0] : params.wh;

  const warehouses = listWarehouses(true);
  const overview = new Map(warehouseOverview().map((row) => [row.warehouseId, row]));
  const utilisation = new Map(locationUtilisation().map((row) => [row.locationId, row]));
  const selected = warehouses.find((warehouse) => warehouse.id === selectedParam) ?? warehouses[0];
  const locations = selected ? listLocations({ warehouseId: selected.id, includeInactive: true }) : [];
  const canManage = can(user.role, 'manage_warehouses');

  const exportRows = locations.map((location) => ({
    warehouse: location.warehouseName ?? '',
    location: location.name,
    code: location.shortCode,
    kind: location.kind,
    quantity: utilisation.get(location.id)?.quantity ?? 0,
    skus: utilisation.get(location.id)?.skus ?? 0,
    value: utilisation.get(location.id)?.value ?? 0,
    active: location.isActive ? 'yes' : 'no',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Warehouses & locations"
        subtitle="Sites, bins and the virtual input/output endpoints that keep the ledger balanced."
        actions={
          <>
            {canManage ? <WarehouseForm /> : null}
            <ExportButton rows={exportRows} filename="stocksense-locations.csv" />
            <PrintButton />
          </>
        }
      />

      <SettingsNav active="warehouses" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Warehouses"
          value={formatNumber(warehouses.filter((warehouse) => warehouse.isActive === 1).length)}
          hint={`${warehouses.length} total including inactive`}
          icon={<Building2 size={16} />}
        />
        <StatTile label="Locations" value={formatNumber(locations.length)} hint={`Inside ${selected?.name ?? 'the selected site'}`} icon={<MapPin size={16} />} accent="sky" />
        <StatTile
          label="Stock value here"
          value={formatMoney(selected ? overview.get(selected.id)?.value ?? 0 : 0, { compact: true })}
          hint={`${formatNumber(selected ? overview.get(selected.id)?.skus ?? 0 : 0)} SKUs with stock`}
          icon={<Package size={16} />}
          accent="emerald"
        />
        <StatTile
          label="Units on hand"
          value={formatQty(selected ? overview.get(selected.id)?.quantity ?? 0 : 0)}
          hint="Physical quantity across every bin"
          icon={<Layers size={16} />}
          accent="violet"
        />
      </div>

      {warehouses.length > 1 ? (
        <div className="surface p-1.5">
          <LinkTabs
            items={warehouses.map((warehouse) => ({
              value: warehouse.id,
              label: warehouse.name,
              href: `/settings/warehouses?wh=${warehouse.id}`,
              tone: selected?.id === warehouse.id ? 'active' : undefined,
            }))}
          />
        </div>
      ) : null}

      {selected ? (
        <>
          <SectionCard
            title={selected.name}
            subtitle={`Code ${selected.shortCode}${selected.isDefault ? ' · default warehouse for new documents' : ''}`}
            action={
              canManage ? (
                <WarehouseForm
                  warehouse={{
                    id: selected.id,
                    name: selected.name,
                    shortCode: selected.shortCode,
                    address: selected.address,
                    contactName: selected.contactName,
                    contactPhone: selected.contactPhone,
                    isDefault: selected.isDefault,
                    isActive: selected.isActive,
                  }}
                  triggerLabel="Edit warehouse"
                  triggerVariant="outline"
                  triggerSize="sm"
                />
              ) : null
            }
          >
            <MetaGrid
              items={[
                { label: 'Short code', value: selected.shortCode },
                { label: 'Status', value: selected.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge> },
                { label: 'Default', value: selected.isDefault ? <Badge tone="brand">Default</Badge> : '—' },
                { label: 'Contact', value: selected.contactName ?? '—' },
                { label: 'Phone', value: selected.contactPhone ?? '—' },
                { label: 'Address', value: selected.address ?? '—' },
                { label: 'Created', value: selected.createdAt.slice(0, 10) },
                { label: 'Locations', value: locations.length },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Locations"
            subtitle="Where stock can physically sit. Input and Output are virtual endpoints used by receipts and deliveries."
            action={
              canManage ? (
                <LocationForm warehouseId={selected.id} triggerLabel="Add location" triggerSize="sm" />
              ) : null
            }
            bodyClassName=""
          >
            <Table minWidth={860}>
              <THead>
                <tr>
                  <TH>Location</TH>
                  <TH>Code</TH>
                  <TH>Type</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">SKUs</TH>
                  <TH align="right">Value</TH>
                  <TH>Status</TH>
                  <TH align="right" />
                </tr>
              </THead>
              <TBody>
                {locations.map((location) => {
                  const stats = utilisation.get(location.id);
                  return (
                    <tr key={location.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                      <TD>
                        <span className="block text-[13px] font-medium text-ink-800 dark:text-ink-100">{location.name}</span>
                        {location.address ? <span className="block text-[11.5px] text-ink-400">{location.address}</span> : null}
                      </TD>
                      <TD className="font-mono text-[12px]">{location.shortCode}</TD>
                      <TD>
                        <Badge tone={KIND_TONE[location.kind] ?? 'neutral'}>
                          {location.kind.charAt(0) + location.kind.slice(1).toLowerCase()}
                        </Badge>
                      </TD>
                      <TD align="right">{formatQty(stats?.quantity ?? 0)}</TD>
                      <TD align="right">{formatNumber(stats?.skus ?? 0)}</TD>
                      <TD align="right">{formatMoney(stats?.value ?? 0, { compact: true })}</TD>
                      <TD>{location.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</TD>
                      <TD align="right">
                        {canManage ? (
                          <LocationForm
                            location={{
                              id: location.id,
                              warehouseId: location.warehouseId,
                              name: location.name,
                              shortCode: location.shortCode,
                              kind: location.kind as LocationKind,
                              address: location.address,
                              isActive: location.isActive,
                            }}
                            warehouseId={location.warehouseId}
                            triggerLabel="Edit"
                            triggerVariant="ghost"
                            triggerSize="xs"
                          />
                        ) : null}
                      </TD>
                    </tr>
                  );
                })}
              </TBody>
            </Table>
          </SectionCard>
        </>
      ) : (
        <SectionCard title="No warehouses yet" subtitle="Create your first site to start receiving stock.">
          {canManage ? <WarehouseForm /> : <p className="text-[13px] text-ink-500">Ask a manager to set up a warehouse.</p>}
        </SectionCard>
      )}

      <p className="text-center text-[11.5px] text-ink-400">
        Need the full stock position?{' '}
        <Link href="/products" className="font-medium text-brand-600 dark:text-brand-400">
          Browse products
        </Link>{' '}
        or open the{' '}
        <Link href="/moves" className="font-medium text-brand-600 dark:text-brand-400">
          move history
        </Link>
        .
      </p>
    </div>
  );
}
