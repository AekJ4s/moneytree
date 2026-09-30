import imageCompression from 'browser-image-compression';
import { SLIP_BUCKET, supabase, check, unwrap } from '../../lib/supabase';

/** Compresses a slip image and uploads it under "<uid>/<date>/<uuid>.webp". Returns the storage path. */
export async function uploadSlipImage(userId: string, date: string, file: File): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1400,
    fileType: 'image/webp',
    useWebWorker: true,
  });
  const path = `${userId}/${date}/${crypto.randomUUID()}.webp`;
  check(await supabase.storage.from(SLIP_BUCKET).upload(path, compressed, { contentType: 'image/webp' }));
  return path;
}

/** Creates short-lived URLs for private slip images, keyed by storage path. */
export async function signSlipUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const rows = unwrap(await supabase.storage.from(SLIP_BUCKET).createSignedUrls(paths, 60 * 60));
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}

export async function removeSlipImage(path: string): Promise<void> {
  check(await supabase.storage.from(SLIP_BUCKET).remove([path]));
}
