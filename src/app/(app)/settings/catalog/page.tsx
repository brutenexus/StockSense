import type { Metadata } from 'next';
import { Layers, Repeat, Sparkles, Tags, Truck, Users } from 'lucide-react';
import { listCategories, listPartners, listProducts, listReorderRules } from '@/lib/repo/catalog';
import { requireUser } from '@/lib/auth/server';
import { can } from '@/lib/domain/constants';
import { formatMoney, formatNumber, formatQty } from '@/lib/format';
import { Badge, PageHeader } from '@/components/ui/primitives';
import { SectionCard, StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { SettingsNav } from '@/components/app/settings-nav';
import { CategoryForm } from '@/components/app/category-form';
import { PartnerForm } from '@/components/app/partner-form';
import { Dot } from '@/components/app/ui';

export const metadata: Metadata = { title: 'Categories & contacts' };

export default async function CatalogSettingsPage() {
  const user = await requireUser('/settings/catalog');
  const canManage = can(user.role, 'manage_products');
  const categories = listCategories();
  const vendors = listPartners({ kind: 'VENDOR' });
  const customers = listPartners({ kind: 'CUSTOMER' });
  const partners = [...vendors, ...customers.filter((customer) => !vendors.some((vendor) => vendor.id === customer.id))];
  const rules = listReorderRules();
  const products = listProducts({ limit: 1 }).total;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Categories & contacts"
        subtitle="Group products, keep vendor and customer details in one place, and tune the reorder rules behind procurement suggestions."
        actions={canManage ? <CategoryForm /> : null}
      />

      <SettingsNav active="catalog" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Categories" value={categories.length} hint={`Across ${formatNumber(products)} products`} icon={<Tags size={16} />} accent="indigo" />
        <StatTile label="Vendors" value={vendors.length} hint="Supply receipts" icon={<Truck size={16} />} accent="sky" />
        <StatTile label="Customers" value={customers.length} hint="Receive deliveries" icon={<Users size={16} />} accent="emerald" />
        <StatTile label="Reorder rules" value={rules.length} hint="Drive the procurement plan" icon={<Repeat size={16} />} accent="amber" />
      </div>

      <SectionCard
        title="Categories"
        subtitle="Colour drives the charts on the dashboard."
        action={canManage ? <CategoryForm triggerLabel="New category" triggerVariant="outline" /> : null}
        bodyClassName=""
      >
        <Table minWidth={760}>
          <THead>
            <tr>
              <TH>Category</TH>
              <TH>Code</TH>
              <TH align="right">Products</TH>
              <TH align="right">Stock value</TH>
              <TH>Description</TH>
              <TH align="right" />
            </tr>
          </THead>
          <TBody>
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                <TD>
                  <span className="flex items-center gap-2">
                    <Dot tone={category.color} />
                    <span className="text-[13px] font-medium text-ink-800 dark:text-ink-100">{category.name}</span>
                  </span>
                </TD>
                <TD className="font-mono text-[12px]">{category.code ?? '—'}</TD>
                <TD align="right">{formatNumber(category.productCount ?? 0)}</TD>
                <TD align="right">{formatMoney(category.stockValue ?? 0, { compact: true })}</TD>
                <TD className="text-[12.5px] text-ink-500 dark:text-ink-400">{category.description ?? '—'}</TD>
                <TD align="right">
                  {canManage ? (
                    <CategoryForm
                      category={{ id: category.id, name: category.name, code: category.code, color: category.color, description: category.description }}
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                    />
                  ) : null}
                </TD>
              </tr>
            ))}
            {categories.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-[12.5px] text-ink-400">
                  No categories yet.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Vendors & customers"
        subtitle="Contacts attached to receipts and deliveries."
        action={canManage ? <PartnerForm triggerLabel="New contact" triggerVariant="outline" /> : null}
        bodyClassName=""
      >
        <Table minWidth={920}>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Type</TH>
              <TH>Contact</TH>
              <TH>Email</TH>
              <TH>Phone</TH>
              <TH>Tax ID</TH>
              <TH align="right">Documents</TH>
              <TH align="right" />
            </tr>
          </THead>
          <TBody>
            {partners.map((partner) => (
              <tr key={partner.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                <TD>
                  <span className="text-[13px] font-medium text-ink-800 dark:text-ink-100">{partner.name}</span>
                  {partner.isActive === 0 ? (
                    <Badge tone="neutral" className="ml-2">
                      Inactive
                    </Badge>
                  ) : null}
                </TD>
                <TD>
                  <Badge tone={partner.kind === 'VENDOR' ? 'info' : partner.kind === 'CUSTOMER' ? 'success' : 'violet'}>
                    {partner.kind === 'BOTH' ? 'Both' : partner.kind === 'VENDOR' ? 'Vendor' : 'Customer'}
                  </Badge>
                </TD>
                <TD className="text-[12.5px]">{partner.contactName ?? '—'}</TD>
                <TD className="text-[12.5px]">{partner.email ?? '—'}</TD>
                <TD className="text-[12.5px]">{partner.phone ?? '—'}</TD>
                <TD className="font-mono text-[11.5px]">{partner.gstin ?? '—'}</TD>
                <TD align="right">{formatNumber(partner.documentCount ?? 0)}</TD>
                <TD align="right">
                  {canManage ? (
                    <PartnerForm
                      partner={{
                        id: partner.id,
                        name: partner.name,
                        kind: partner.kind,
                        contactName: partner.contactName,
                        email: partner.email,
                        phone: partner.phone,
                        address: partner.address,
                        gstin: partner.gstin,
                        isActive: partner.isActive,
                      }}
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                    />
                  ) : null}
                </TD>
              </tr>
            ))}
            {partners.length === 0 ? (
              <tr>
                <TD colSpan={8} className="py-10 text-center text-[12.5px] text-ink-400">
                  No contacts yet.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Reorder rules"
        subtitle="Thresholds behind the procurement suggestions on the dashboard."
        action={<Sparkles size={15} className="text-ink-400" />}
        bodyClassName=""
      >
        <Table minWidth={820}>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH>Warehouse</TH>
              <TH align="right">Min</TH>
              <TH align="right">Max</TH>
              <TH align="right">Qty to order</TH>
              <TH>Policy</TH>
            </tr>
          </THead>
          <TBody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <TD>
                  <span className="block text-[13px] font-medium text-ink-800 dark:text-ink-100">{rule.productName}</span>
                  <span className="block text-[11.5px] text-ink-400">{rule.sku}</span>
                </TD>
                <TD className="text-[12.5px]">{rule.warehouseName ?? 'Any warehouse'}</TD>
                <TD align="right">{formatQty(rule.minQty)}</TD>
                <TD align="right">{formatQty(rule.maxQty)}</TD>
                <TD align="right">{formatQty(rule.qtyToOrder)}</TD>
                <TD>
                  {rule.autoDraft ? <Badge tone="brand" dot>Auto-draft</Badge> : <Badge tone="neutral" dot>Manual</Badge>}
                </TD>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-[12.5px] text-ink-400">
                  No reorder rules yet — suggestions fall back to each product&apos;s reorder point and quantity.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
        <p className="mt-3 flex items-center gap-1.5 px-1 text-[11.5px] text-ink-400">
          <Layers size={12} /> Rules are evaluated on every stock movement, so suggestions stay current.
        </p>
      </SectionCard>
    </div>
  );
}
