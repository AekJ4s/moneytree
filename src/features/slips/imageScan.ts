import jsQR from 'jsqr';
import { createWorker, type Worker } from 'tesseract.js';

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

const MAX_SCAN_SIDE = 1600;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function drawRegion(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxSide: number,
): ImageData {
  const scale = Math.min(maxSide / Math.max(sw, sh), 2);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Reads every QR code value in the image. Uses the native BarcodeDetector when the
 * browser has one (fast, finds multiple codes), and falls back to jsQR on the whole
 * image and then on overlapping tiles, since slip QR codes are often small.
 */
export async function decodeQrCodes(file: Blob): Promise<string[]> {
  const bitmap = await loadBitmap(file);
  try {
    if (window.BarcodeDetector) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const found = await detector.detect(bitmap);
        const values = found.map((b) => b.rawValue).filter(Boolean);
        if (values.length > 0) return Array.from(new Set(values));
      } catch {
        // Unsupported format or platform quirk: fall through to jsQR.
      }
    }

    const { width, height } = bitmap;
    const regions: [number, number, number, number][] = [[0, 0, width, height]];
    const tw = width * 0.6;
    const th = height * 0.6;
    for (const fx of [0, 0.4]) {
      for (const fy of [0, 0.4]) regions.push([width * fx, height * fy, tw, th]);
    }
    const values = new Set<string>();
    for (const [sx, sy, sw, sh] of regions) {
      const img = drawRegion(bitmap, sx, sy, sw, sh, MAX_SCAN_SIDE);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) values.add(code.data);
      if (values.size > 0 && sx === 0 && sy === 0 && sw === width) break;
    }
    return Array.from(values);
  } finally {
    bitmap.close();
  }
}

let workerPromise: Promise<Worker> | null = null;

/** Lazily creates one shared Thai+English OCR worker (language data is cached by the browser). */
function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(['tha', 'eng']).catch((err: unknown) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export async function recognizeText(file: Blob): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(file);
  return data.text;
}

export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  await worker?.terminate();
}
