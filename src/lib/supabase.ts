import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const SLIP_BUCKET = 'slips';

type Result<T> = { data: T | null; error: { message: string } | null };

/** Throws on error and returns the (non-null) data. */
export function unwrap<T>(result: Result<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Unexpected empty response');
  return result.data;
}

/** Throws on error; data may legitimately be null (e.g. maybeSingle). */
export function unwrapMaybe<T>(result: Result<T>): T | null {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Throws on error for writes that return no data. */
export function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}
