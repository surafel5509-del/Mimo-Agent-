import 'server-only';
import { getEnv } from '@/lib/config';
import { ApiError } from '@/lib/http/errors';
import type { AllowedExtension } from '@/lib/storage/file-validation';

/**
 * Extracts plain text from a validated upload. Parsing runs in-process with pure JS libraries
 * (no shell, no external binaries). Failures become user-facing extraction errors.
 */
export async function extractText(ext: AllowedExtension, buf: Buffer): Promise<string> {
  const maxChars = 2_000_000;
  let text: string;
  try {
    switch (ext) {
      case 'pdf': {
        const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
        const parsed = await pdfParse(buf, { max: 300 });
        text = parsed.text;
        break;
      }
      case 'docx': {
        const mammoth = await import('mammoth');
        const res = await mammoth.extractRawText({ buffer: buf });
        text = res.value;
        break;
      }
      case 'txt':
      case 'csv':
        text = buf.toString('utf8');
        break;
      default:
        text = '';
    }
  } catch {
    throw new ApiError(422, 'extraction_failed', 'We could not read text from this file. It may be encrypted or damaged.');
  }
  if (text.length > maxChars) text = text.slice(0, maxChars);
  if (!text.trim() && ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
    throw new ApiError(422, 'no_text', 'No readable text was found in this file. Scanned PDFs need OCR first.');
  }
  return text.replace(/\u0000/g, '');
}

export function embeddingsEnabled(): boolean {
  return Boolean(getEnv().NVIDIA_EMBEDDING_MODEL);
}
