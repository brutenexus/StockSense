/**
 * Validation rules — lifted verbatim from the mock-up annotations:
 *
 *  - login ID must be unique and 6–12 characters
 *  - email must not be a duplicate
 *  - password needs a lowercase letter, an uppercase letter, a special
 *    character and more than 8 characters
 *  - login failures must surface "Invalid Login Id or Password"
 */
export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const INVALID_CREDENTIALS = 'Invalid Login Id or Password';

const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

export function validateLoginId(loginId: string): string | null {
  const value = (loginId || '').trim();
  if (!value) return 'Login Id is required';
  if (value.length < 6 || value.length > 12) return 'Login Id must be between 6 and 12 characters';
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return 'Login Id can use letters, numbers, dot, dash and underscore';
  return null;
}

export function validateEmail(email: string): string | null {
  const value = (email || '').trim();
  if (!value) return 'Email Id is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Enter a valid email address';
  return null;
}

export function validateName(name: string): string | null {
  const value = (name || '').trim();
  if (!value) return 'Full name is required';
  if (value.length < 3) return 'Full name must be at least 3 characters';
  return null;
}

export type PasswordStrength = { score: number; label: string; checks: Record<string, boolean> };

export function passwordStrength(password: string): PasswordStrength {
  const checks = {
    length: (password || '').length > 8,
    lowercase: /[a-z]/.test(password || ''),
    uppercase: /[A-Z]/.test(password || ''),
    special: SPECIAL_RE.test(password || ''),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const label = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score] ?? 'Very weak';
  return { score, label, checks };
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  const { checks } = passwordStrength(password);
  if (!checks.length) return 'Password must be more than 8 characters long';
  if (!checks.lowercase) return 'Password must contain a small case letter';
  if (!checks.uppercase) return 'Password must contain a large case letter';
  if (!checks.special) return 'Password must contain a special character';
  return null;
}

export function validatePasswordConfirmation(password: string, confirm: string): string | null {
  if (!confirm) return 'Re-enter the password';
  if (password !== confirm) return 'Passwords do not match';
  return null;
}

export type SignupInput = {
  loginId: string;
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  role?: string;
};

export function validateSignup(input: SignupInput): Validated<SignupInput> {
  const errors: FieldErrors = {};
  const loginIdError = validateLoginId(input.loginId);
  if (loginIdError) errors.loginId = loginIdError;
  const emailError = validateEmail(input.email);
  if (emailError) errors.email = emailError;
  const nameError = validateName(input.name);
  if (nameError) errors.name = nameError;
  const passwordError = validatePassword(input.password);
  if (passwordError) errors.password = passwordError;
  const confirmError = validatePasswordConfirmation(input.password, input.confirmPassword);
  if (confirmError) errors.confirmPassword = confirmError;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: input };
}

/* --------------------------------------------------------------- documents */

export type DocumentLineInput = {
  productId: string;
  quantity: number;
  unitCost?: number;
  note?: string;
  /** Adjustments only: the counted quantity entered by the operator. */
  counted?: number;
};

export type DocumentInput = {
  type: string;
  warehouseId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  partnerId?: string | null;
  partnerName?: string | null;
  scheduleDate?: string | null;
  responsibleId?: string | null;
  operationType?: string | null;
  address?: string | null;
  priority?: string | null;
  notes?: string | null;
  lines: DocumentLineInput[];
};

export function validateDocument(input: DocumentInput): Validated<DocumentInput> {
  const errors: FieldErrors = {};
  if (!input.warehouseId) errors.warehouseId = 'A warehouse is required';
  const lines = (input.lines ?? []).filter((l) => l.productId);
  if (!lines.length) errors.lines = 'Add at least one product line';
  lines.forEach((line, index) => {
    const qty = input.type === 'ADJUSTMENT' ? line.counted : line.quantity;
    if (!Number.isFinite(qty)) {
      errors[`lines.${index}.quantity`] = 'Enter a quantity';
    } else if (input.type === 'ADJUSTMENT' && Number(qty) < 0) {
      errors[`lines.${index}.quantity`] = 'Counted quantity cannot be negative';
    } else if (input.type !== 'ADJUSTMENT' && Number(qty) <= 0) {
      errors[`lines.${index}.quantity`] = 'Quantity must be greater than zero';
    }
  });
  if (input.type === 'RECEIPT' && !input.toLocationId) errors.toLocationId = 'Choose a destination location';
  if (input.type === 'DELIVERY' && !input.fromLocationId) errors.fromLocationId = 'Choose a source location';
  if (input.type === 'TRANSFER') {
    if (!input.fromLocationId) errors.fromLocationId = 'Choose a source location';
    if (!input.toLocationId) errors.toLocationId = 'Choose a destination location';
    if (input.fromLocationId && input.fromLocationId === input.toLocationId) {
      errors.toLocationId = 'Source and destination must differ';
    }
  }
  if (input.type === 'ADJUSTMENT' && !input.fromLocationId) errors.fromLocationId = 'Choose a location';
  const duplicates = new Set<string>();
  lines.forEach((line, index) => {
    if (duplicates.has(line.productId)) errors[`lines.${index}.productId`] = 'Duplicate product line';
    duplicates.add(line.productId);
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { ...input, lines } };
}

export function validateProduct(input: {
  sku: string;
  name: string;
  costPrice?: number;
  salePrice?: number;
  reorderPoint?: number;
  initialStock?: number;
}): Validated<typeof input> {
  const errors: FieldErrors = {};
  if (!(input.name || '').trim()) errors.name = 'Product name is required';
  const sku = (input.sku || '').trim();
  if (!sku) errors.sku = 'SKU / Code is required';
  else if (!/^[A-Za-z0-9._\-/]{2,32}$/.test(sku)) errors.sku = 'SKU can use letters, numbers, dot, dash and slash';
  for (const [field, min] of [
    ['costPrice', 0],
    ['salePrice', 0],
    ['reorderPoint', 0],
    ['initialStock', 0],
  ] as const) {
    const value = input[field];
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value < min)) {
      errors[field] = 'Enter a value of 0 or more';
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: input };
}

export function firstError(validated: { ok: false; errors: FieldErrors }): string {
  return Object.values(validated.errors)[0] ?? 'Invalid input';
}
