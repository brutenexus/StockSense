import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, Package, TriangleAlert } from 'lucide-react';
import { listCategories, listProducts } from '@/lib/repo/catalog';
import { stockTotals } from '@/lib/repo/inventory';
import { listLocations } from '@/lib/repo/warehouses';
import { can } from '@/lib/domain/constants';
import { requireUser } from '@/lib/auth/server';
import { formatMoney, formatQty } from '@/lib/format';
import { Badge, Button, HealthPill, PageHeader } from '@/components/ui/primitives';
import { LinkTabs, Pagination } from '@/components/ui/nav';
import { ActiveFilters, ExportButton, FilterSelect, PrintButton, SearchField } from '@/components/app/filters';
import { StatTile, TBody, TD, TH, THead, Table } from '@/components/app/ui';
import { ProductForm } from '@/components/app/product-form';

export const metadata: Metadata = { title: 'Products' };

const PAGE_SIZE = 25;
const SORTS = [
  { value: 'name', label: 'Name (A→Z)' },
  { value: 'onHand', label: 'On hand (low→high)' },
  { value: 'value', label: 'Stock value' },
  { value: 'updated', label: 'Recently updated' },
];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser('/products');
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = single('q') ?? '';
  const categoryId = single('category') ?? '';
  const health = (single('health') ?? 'ALL') as 'ALL' | 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  const sort = (single('sort') ?? 'name') as 'name' | 'onHand' | 'value' | 'updated';
  const direction = (single('dir') ?? (sort === 'value' || sort === 'updated' ? 'desc' : 'asc')) as 'asc' | 'desc';
  const page = Math.max(1, Number(single('page') ?? 1) || 1);
  const openNew = single('new') === '1';

  const categories = listCategories();
  const totals = stockTotals();
  const locations = listLocations({ internal: true });

  // Every tab count is measured with its own health bucket applied, so the
  // numbers stay meaningful while a health filter is active.
  const baseQuery = { search, categoryId, sort, direction, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
  const result = listProducts({ ...baseQuery, health });
  const all = listProducts({ ...baseQuery, health: 'ALL', limit: 1 });
  const healthy = listProducts({ ...baseQuery, health: 'HEALTHY', limit: 1 });
  const low = listProducts({ ...baseQuery, health: 'LOW_STOCK', limit: 1 });
  const out = listProducts({ ...baseQuery, health: 'OUT_OF_STOCK', limit: 1 });

  const showCosts = can(user.role, 'view_costs');
  const buildHref = (pageNumber: number) => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (categoryId) next.set('category', categoryId);
    if (health !== 'ALL') next.set('health', health);
    if (sort !== 'name') next.set('sort', sort);
    next.set('page', String(pageNumber));
    return `/products?${next.toString()}`;
  };

  const exportRows = result.items.map((product) => ({
    sku: product.sku,
    name: product.name,
    category: product.categoryName ?? '',
    uom: product.uom,
    onHand: product.onHand,
    reserved: product.reserved,
    freeToUse: product.freeToUse,
    reorderPoint: product.reorderPoint,
    reorderQty: product.reorderQty,
    costPrice: product.costPrice,
    salePrice: product.salePrice,
    stockValue: product.stockValue,
    health: product.health,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        subtitle="Everything you stock, with live balances rolled up from every warehouse location."
        actions={
          <>
            <ProductForm
              categories={categories.map((category) => ({ id: category.id, label: category.name }))}
              locations={locations.map((location) => ({ id: location.id, label: `${location.warehouseCode} · ${location.shortCode}` }))}
              openInitially={openNew}
            />
            <ExportButton rows={exportRows} filename="stocksense-products.csv" />
            <PrintButton />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active products" value={all.total.toLocaleString('en-IN')} hint={`${formatMoney(totals.value, { compact: true })} of stock at cost`} icon={<Package size={16} />} />
        <StatTile label="Units on hand" value={formatQty(totals.onHand)} hint={`${formatQty(totals.reserved)} reserved`} icon={<Boxes size={16} />} accent="sky" />
        <StatTile label="Low stock" value={low.total.toLocaleString('en-IN')} hint="At or below the reorder point" icon={<TriangleAlert size={16} />} accent="amber" href="/products?health=LOW_STOCK" />
        <StatTile label="Out of stock" value={out.total.toLocaleString('en-IN')} hint="Nothing left on the shelves" icon={<TriangleAlert size={16} />} accent="rose" href="/products?health=OUT_OF_STOCK" />
      </div>

      <div className="surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <LinkTabs
            items={[
              { value: 'ALL', label: 'All', count: all.total, href: buildHealthHref(search, categoryId, sort, 'ALL'), tone: health === 'ALL' ? 'active' : undefined },
              { value: 'HEALTHY', label: 'Healthy', count: healthy.total, href: buildHealthHref(search, categoryId, sort, 'HEALTHY'), tone: health === 'HEALTHY' ? 'active' : undefined },
              { value: 'LOW_STOCK', label: 'Low stock', count: low.total, href: buildHealthHref(search, categoryId, sort, 'LOW_STOCK'), tone: health === 'LOW_STOCK' ? 'active' : undefined },
              { value: 'OUT_OF_STOCK', label: 'Out of stock', count: out.total, href: buildHealthHref(search, categoryId, sort, 'OUT_OF_STOCK'), tone: health === 'OUT_OF_STOCK' ? 'active' : undefined },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SearchField placeholder="Search name, SKU or barcode…" className="w-full sm:w-64" />
            <FilterSelect
              paramKey="category"
              ariaLabel="Category"
              allLabel="All categories"
              options={categories.map((category) => ({ value: category.id, label: category.name }))}
            />
            <FilterSelect paramKey="sort" ariaLabel="Sort" allLabel="Sort: name" options={SORTS} />
            <Link href="/products">
              <Button size="sm" variant="ghost">
                Reset
              </Button>
            </Link>
          </div>
        </div>
        <ActiveFilters labels={[{ key: 'category', label: 'Category filter' }, { key: 'health', label: 'Health filter' }, { key: 'sort', label: 'Custom sort' }]} />
      </div>

      <div className="surface overflow-hidden">
        {result.items.length ? (
          <Table minWidth={showCosts ? 1000 : 820}>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH>Category</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Free to use</TH>
                <TH align="right">Reorder at</TH>
                {showCosts ? <TH align="right">Cost</TH> : null}
                {showCosts ? <TH align="right">Stock value</TH> : null}
                <TH>Status</TH>
                <TH align="right" />
              </tr>
            </THead>
            <TBody>
              {result.items.map((product) => (
                <tr key={product.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/40">
                  <TD>
                    <Link href={`/products/${product.id}`} className="focus-ring rounded">
                      <span className="block text-[13px] font-medium text-ink-900 dark:text-white">{product.name}</span>
                      <span className="block text-[11.5px] text-ink-400">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </span>
                    </Link>
                  </TD>
                  <TD>
                    {product.categoryName ? <Badge tone="neutral">{product.categoryName}</Badge> : <span className="text-ink-400">—</span>}
                  </TD>
                  <TD align="right">{formatQty(product.onHand, product.uom)}</TD>
                  <TD align="right">{formatQty(product.freeToUse, product.uom)}</TD>
                  <TD align="right">{formatQty(product.reorderPoint, product.uom)}</TD>
                  {showCosts ? <TD align="right">{formatMoney(product.costPrice)}</TD> : null}
                  {showCosts ? <TD align="right">{formatMoney(product.stockValue, { compact: true })}</TD> : null}
                  <TD>
                    <HealthPill health={product.health} />
                  </TD>
                  <TD align="right">
                    <Link href={`/products/${product.id}`} className="focus-ring rounded text-[12.5px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
                      Open
                    </Link>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-semibold text-ink-800 dark:text-ink-100">No products match those filters</p>
            <p className="mt-1 text-[12.5px] text-ink-500 dark:text-ink-400">Try a different search, or create the product you are looking for.</p>
            <div className="mt-4 flex justify-center">
              <Link href="/products">
                <Button size="sm" variant="outline">
                  Clear filters
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} buildHref={buildHref} />
    </div>
  );
}

function buildHealthHref(search: string, categoryId: string, sort: string, health: string): string {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (categoryId) params.set('category', categoryId);
  if (sort !== 'name') params.set('sort', sort);
  if (health !== 'ALL') params.set('health', health);
  const query = params.toString();
  return query ? `/products?${query}` : '/products';
}
