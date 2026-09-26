/**
 * Route-handler plumbing.
 *
 * Every `/api` route funnels through `handle()` so failures come back as a
 * predictable `{ error, errors? }` payload with a sensible status code — the
 * shape `lib/api.ts` already knows how to unpack on the client.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { logger } from './logger';
import { can, type Capability } from './domain/constants';
import { currentUser } from './auth/server';
import type { SessionUser } from './repo/users';
import { DocumentError } from './repo/documents';

export class HttpError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(message: string, status = 400, errors?: Record<string, string>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.errors = errors;
  }
}

export function badRequest(message: string, errors?: Record<string, string>): never {
  throw new HttpError(message, 400, errors);
}

export function notFound(message = 'That record no longer exists.'): never {
  throw new HttpError(message, 404);
}

export function forbidden(message = 'Your role is not allowed to do that.'): never {
  throw new HttpError(message, 403);
}

/** Resolves the signed-in user or fails with 401. */
export async function apiUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError('Your session has expired. Please sign in again.', 401);
  return user;
}

/** Resolves the signed-in user and checks one capability. */
export async function apiCapability(capability: Capability): Promise<SessionUser> {
  const user = await apiUser();
  if (!can(user.role, capability)) forbidden(`Your role cannot ${capability.replace(/_/g, ' ')}.`);
  return user;
}

/** True when the role may perform at least one of the capabilities. */
export async function apiAnyCapability(...capabilities: Capability[]): Promise<SessionUser> {
  const user = await apiUser();
  if (!capabilities.some((capability) => can(user.role, capability))) forbidden();
  return user;
}

export async function handle(fn: () => unknown | Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    return NextResponse.json(data === undefined ? { ok: true } : data);
  } catch (error) {
    const status =
      error instanceof HttpError ? error.status : error instanceof DocumentError ? 400 : 500;
    const message = error instanceof Error ? error.message : 'Unexpected error';
    if (status >= 500) logger.error(`api: ${message}`);
    return NextResponse.json(
      { error: message, ...(error instanceof HttpError && error.errors ? { errors: error.errors } : {}) },
      { status },
    );
  }
}

/* -------------------------------------------------------------------- input */

export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') badRequest('Expected a JSON object.');
    return parsed as T;
  } catch {
    return badRequest('The request body was not valid JSON.') as never;
  }
}

export function query(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) badRequest(`${field} is required.`, { [field]: 'Required' });
  return value.trim();
}

export function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function number(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function optionalNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  return number(value, fallback);
}

export function flag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  const raw = String(value ?? '');
  if (allowed.includes(raw as T)) return raw as T;
  if (fallback !== undefined) return fallback;
  badRequest(`${field} must be one of: ${allowed.join(', ')}.`, { [field]: 'Invalid value' });
  return allowed[0]!;
}

export function intParam(source: URLSearchParams, key: string, fallback: number): number {
  const raw = source.get(key);
  if (raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function numParam(source: URLSearchParams, key: string): number | undefined {
  const raw = source.get(key);
  if (raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function textParam(source: URLSearchParams, key: string): string | undefined {
  const raw = source.get(key)?.trim();
  return raw ? raw : undefined;
}

export function listParam(source: URLSearchParams, key: string): string[] {
  const raw = source.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Absolute end-of-day for inclusive date filters typed as `YYYY-MM-DD`. */
export function endOfDay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.length === 10 ? `${value}T23:59:59.999Z` : value;
}
