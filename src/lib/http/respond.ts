import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';
import { log } from '@/lib/logging/logger';
import { writeAudit } from '@/lib/services/audit';
import { redactSecrets } from '@/lib/security/redact';

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': 'no-store', ...(init?.headers ?? {}) },
  });
}

/** Converts any thrown value into a safe JSON error. Internal details are never returned. */
export async function errorResponse(err: unknown, req?: Request): Promise<NextResponse> {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      { status: err.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Some fields are invalid.', details } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const message = err instanceof Error ? redactSecrets(err.message) : 'unknown';
  log('error', 'api.unhandled', { message, path: req ? new URL(req.url).pathname : undefined });
  await writeAudit({ category: 'error', action: 'api.unhandled', metadata: { message: message.slice(0, 500) } });
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Something went wrong on our side. Please try again.' } },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}

type RouteCtx<P> = { params: Promise<P> };

/** Wraps a route handler so errors always produce a safe JSON response. */
export function apiRoute<P = Record<string, string>>(
  handler: (req: Request, ctx: RouteCtx<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

/** Reads and parses a JSON body with a byte limit. */
export async function readJson(req: Request, maxBytes = 256_000): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new ApiError(413, 'payload_too_large', 'Request body is too large.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'bad_json', 'The request body must be valid JSON.');
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64);
  return req.headers.get('x-real-ip')?.slice(0, 64) ?? 'unknown';
}
