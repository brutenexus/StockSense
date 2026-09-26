/** Domain vocabulary shared by the UI, the API and the persistence layer. */

export const DOCUMENT_TYPES = ['RECEIPT', 'DELIVERY', 'TRANSFER', 'ADJUSTMENT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = ['DRAFT', 'WAITING', 'READY', 'DONE', 'CANCELED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const LOCATION_KINDS = ['INTERNAL', 'INPUT', 'OUTPUT', 'PRODUCTION', 'TRANSIT'] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const ROLES = ['MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const MOVE_DIRECTIONS = ['IN', 'OUT'] as const;
export type MoveDirection = (typeof MOVE_DIRECTIONS)[number];

export const UOMS = ['Unit', 'Kg', 'Litre', 'Metre', 'Box', 'Pack', 'Roll', 'Set', 'Hour'] as const;

export const PARTNER_KINDS = ['VENDOR', 'CUSTOMER', 'BOTH'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const NOTIFICATION_KINDS = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'DOCUMENT_LATE',
  'DOCUMENT_WAITING',
  'DOCUMENT_DONE',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TYPE_META: Record<
  DocumentType,
  {
    label: string;
    plural: string;
    /** Segment used inside the generated reference, e.g. WH/IN/0001 */
    refCode: string;
    href: string;
    accent: string;
    description: string;
  }
> = {
  RECEIPT: {
    label: 'Receipt',
    plural: 'Receipts',
    refCode: 'IN',
    href: '/operations/receipts',
    accent: 'emerald',
    description: 'Incoming stock from a vendor',
  },
  DELIVERY: {
    label: 'Delivery',
    plural: 'Deliveries',
    refCode: 'OUT',
    href: '/operations/deliveries',
    accent: 'sky',
    description: 'Outgoing stock to a customer',
  },
  TRANSFER: {
    label: 'Internal Transfer',
    plural: 'Internal Transfers',
    refCode: 'INT',
    href: '/operations/transfers',
    accent: 'violet',
    description: 'Move stock between locations',
  },
  ADJUSTMENT: {
    label: 'Inventory Adjustment',
    plural: 'Adjustments',
    refCode: 'ADJ',
    href: '/operations/adjustments',
    accent: 'amber',
    description: 'Reconcile recorded vs physical count',
  },
};

export const STATUS_META: Record<
  DocumentStatus,
  { label: string; tone: 'draft' | 'waiting' | 'ready' | 'done' | 'canceled'; hint: string }
> = {
  DRAFT: { label: 'Draft', tone: 'draft', hint: 'Initial state — still being edited' },
  WAITING: { label: 'Waiting', tone: 'waiting', hint: 'Waiting for out-of-stock products to arrive' },
  READY: { label: 'Ready', tone: 'ready', hint: 'Reserved and ready to receive / deliver' },
  DONE: { label: 'Done', tone: 'done', hint: 'Received or delivered — stock already moved' },
  CANCELED: { label: 'Canceled', tone: 'canceled', hint: 'Canceled — reservations released' },
};

/** The state machine, exactly as drawn on the mock-up. */
export const STATUS_FLOW: Record<DocumentType, DocumentStatus[]> = {
  RECEIPT: ['DRAFT', 'READY', 'DONE'],
  DELIVERY: ['DRAFT', 'WAITING', 'READY', 'DONE'],
  TRANSFER: ['DRAFT', 'WAITING', 'READY', 'DONE'],
  ADJUSTMENT: ['DRAFT', 'READY', 'DONE'],
};

export const ROLE_META: Record<Role, { label: string; blurb: string }> = {
  MANAGER: {
    label: 'Inventory Manager',
    blurb: 'Full control: products, warehouses, users, receipts and deliveries.',
  },
  STAFF: {
    label: 'Warehouse Staff',
    blurb: 'Transfers, picking, shelving and counting inside the warehouse.',
  },
};

/** Capabilities used for role based access control. */
export const CAPABILITIES = [
  'manage_products',
  'manage_warehouses',
  'manage_users',
  'manage_settings',
  'create_receipt',
  'create_delivery',
  'create_transfer',
  'create_adjustment',
  'validate_receipt',
  'validate_delivery',
  'validate_transfer',
  'validate_adjustment',
  'cancel_document',
  'view_costs',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  MANAGER: [...CAPABILITIES],
  STAFF: [
    'create_transfer',
    'create_adjustment',
    'validate_receipt',
    'validate_transfer',
    'validate_adjustment',
    'cancel_document',
  ],
};

export function can(role: Role | string | undefined, capability: Capability): boolean {
  if (!role) return false;
  const list = ROLE_CAPABILITIES[role as Role];
  return Array.isArray(list) && list.includes(capability);
}

export const ACCENTS = [
  'indigo',
  'sky',
  'emerald',
  'amber',
  'rose',
  'violet',
  'teal',
  'orange',
  'slate',
] as const;
export type Accent = (typeof ACCENTS)[number];
