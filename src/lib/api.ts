/** Thin fetch wrapper so client components get consistent, readable errors. */
export type ApiError = { error: string; errors?: Record<string, string>; status: number };

export class RequestFailed extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'RequestFailed';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : null) || `Request failed with status ${response.status}`;
    const fields =
      payload && typeof payload === 'object' && 'errors' in payload
        ? ((payload as { errors?: Record<string, string> }).errors ?? undefined)
        : undefined;
    throw new RequestFailed(message, response.status, fields);
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof RequestFailed) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

/** Debounced value helper used by search inputs. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay = 280) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
