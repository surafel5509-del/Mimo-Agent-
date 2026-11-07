import { getEnv } from '@/lib/config';
import { ApiError } from '@/lib/http/errors';

export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'csv', 'docx', 'png', 'jpg', 'jpeg'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export type ValidatedFile = {
  extension: AllowedExtension;
  mimeType: string;
  kind: 'document' | 'data' | 'image';
};

const MIME: Record<AllowedExtension, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export const MAX_UPLOAD_BYTES = () => getEnv().MAX_UPLOAD_MB * 1024 * 1024;

/** Returns the lower-case extension if it is in the allow list, otherwise null. */
export function allowedExtension(filename: string): AllowedExtension | null {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return null;
  const ext = filename.slice(idx + 1).toLowerCase();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext) ? (ext as AllowedExtension) : null;
}

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an upload by its CONTENT, not its filename or the client-declared MIME type.
 * - size limit
 * - extension must be allowed
 * - magic bytes must match the extension (PDF, PNG, JPEG, DOCX/ZIP structure)
 * - text formats must be valid UTF-8 with no binary NUL bytes
 */
export function validateUpload(filename: string, buf: Buffer): ValidatedFile {
  if (buf.length === 0) throw new ApiError(400, 'empty_file', 'The uploaded file is empty.');
  if (buf.length > MAX_UPLOAD_BYTES()) {
    throw new ApiError(413, 'file_too_large', `Files must be ${getEnv().MAX_UPLOAD_MB} MB or smaller.`);
  }
  const ext = allowedExtension(filename);
  if (!ext) {
    throw new ApiError(415, 'unsupported_file_type', 'Unsupported file type. Allowed: PDF, TXT, CSV, DOCX, PNG, JPG, JPEG.');
  }

  const mismatch = () =>
    new ApiError(415, 'file_content_mismatch', `The file content does not match a valid .${ext} file.`);

  switch (ext) {
    case 'pdf':
      if (!startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw mismatch(); // %PDF-
      break;
    case 'png':
      if (!startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) throw mismatch();
      break;
    case 'jpg':
    case 'jpeg':
      if (!startsWith(buf, [0xff, 0xd8, 0xff])) throw mismatch();
      break;
    case 'docx': {
      if (!startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) throw mismatch();
      const hay = buf.toString('latin1');
      if (!hay.includes('[Content_Types].xml') || !hay.includes('word/document.xml')) throw mismatch();
      break;
    }
    case 'txt':
    case 'csv': {
      const sample = buf.subarray(0, Math.min(buf.length, 8192));
      if (sample.includes(0x00)) throw mismatch();
      if (!isValidUtf8(buf)) throw mismatch();
      break;
    }
  }

  const kind: ValidatedFile['kind'] =
    ext === 'csv' ? 'data' : ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? 'image' : 'document';
  return { extension: ext, mimeType: MIME[ext], kind };
}

export const IMAGE_MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
