import { describe, expect, it } from 'vitest';
import { allowedExtension, validateUpload } from '@/lib/storage/file-validation';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml word/document.xml'), Buffer.alloc(64, 3)]);

describe('upload validation', () => {
  it('accepts each allowed type with matching content', () => {
    expect(validateUpload('photo.png', png)).toBeTruthy();
    expect(validateUpload('photo.JPG', jpg)).toBeTruthy();
    expect(validateUpload('photo.jpeg', jpg)).toBeTruthy();
    expect(validateUpload('report.pdf', pdf)).toBeTruthy();
    expect(validateUpload('report.docx', docx)).toBeTruthy();
    expect(validateUpload('notes.txt', Buffer.from('plain text'))).toBeTruthy();
    expect(validateUpload('data.csv', Buffer.from('a,b\n1,2\n'))).toBeTruthy();
  });

  it('rejects executables and unlisted types by extension', () => {
    for (const name of ['virus.exe', 'script.js', 'page.html', 'archive.zip', 'noextension']) {
      expect(allowedExtension(name)).toBeNull();
      expect(() => validateUpload(name, Buffer.from('x'))).toThrow();
    }
  });

  it('rejects a disguised file whose bytes do not match its extension', () => {
    expect(() => validateUpload('evil.png', Buffer.from('<script>alert(1)</script>'))).toThrow(/does not match/);
    expect(() => validateUpload('evil.pdf', png)).toThrow(/does not match/);
    expect(() => validateUpload('evil.docx', pdf)).toThrow(/does not match/);
  });

  it('rejects empty and oversized files', () => {
    expect(() => validateUpload('empty.txt', Buffer.alloc(0))).toThrow(/empty/);
    const big = Buffer.alloc(11 * 1024 * 1024, 0x61);
    expect(() => validateUpload('big.txt', big)).toThrow(/MB or smaller/);
  });

  it('does not trust a double extension', () => {
    expect(allowedExtension('invoice.pdf.exe')).toBeNull();
  });
});
