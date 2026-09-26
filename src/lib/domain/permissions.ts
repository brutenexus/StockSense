import { can, type Capability, type DocumentType, type Role } from './constants';

const CREATE: Record<DocumentType, Capability> = {
  RECEIPT: 'create_receipt',
  DELIVERY: 'create_delivery',
  TRANSFER: 'create_transfer',
  ADJUSTMENT: 'create_adjustment',
};

const VALIDATE: Record<DocumentType, Capability> = {
  RECEIPT: 'validate_receipt',
  DELIVERY: 'validate_delivery',
  TRANSFER: 'validate_transfer',
  ADJUSTMENT: 'validate_adjustment',
};

export function canCreateDocument(role: Role | string | undefined, type: DocumentType): boolean {
  return can(role, CREATE[type]);
}

export function canValidateDocument(role: Role | string | undefined, type: DocumentType): boolean {
  return can(role, VALIDATE[type]);
}

export function canCancelDocument(role: Role | string | undefined): boolean {
  return can(role, 'cancel_document');
}

export function documentCapabilities(role: Role | string | undefined, type: DocumentType) {
  return {
    create: canCreateDocument(role, type),
    validate: canValidateDocument(role, type),
    cancel: canCancelDocument(role),
    viewCosts: can(role, 'view_costs'),
    manageProducts: can(role, 'manage_products'),
    manageWarehouses: can(role, 'manage_warehouses'),
    manageUsers: can(role, 'manage_users'),
    manageSettings: can(role, 'manage_settings'),
  };
}
