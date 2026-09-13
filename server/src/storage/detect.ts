// Content sniffing from magic bytes — never trust client MIME/extension.
// Dependency-free on purpose: the popular `file-type` package is ESM-only,
// which breaks CJS production bundles. Only allowlisted types are detected;
// everything else is rejected. Polyglot hardening beyond magic matching
// (re-encoding, AV scanning) is documented future work for uploads.

export type MediaKind = 'IMAGE' | 'VIDEO' | 'FILE';

export interface DetectedMedia {
  mimeType: string;
  kind: MediaKind;
  extension: string;
}

function asciiAt(buf: Buffer, offset: number, length: number): string {
  return buf.subarray(offset, offset + length).toString('ascii');
}

function isTextLike(sample: Buffer): boolean {
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const b = sample[i];
    const ok =
      b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80;
    if (!ok) {
      if (b === 0x00) return false;
      suspicious += 1;
    }
  }
  return suspicious / sample.length < 0.05;
}

// Inspects the head of a file (first bytes are enough for all allowlisted
// types) plus a text heuristic over the provided sample.
export function detectMedia(head: Buffer, textSample: Buffer): DetectedMedia | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mimeType: 'image/jpeg', kind: 'IMAGE', extension: 'jpg' };
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return { mimeType: 'image/png', kind: 'IMAGE', extension: 'png' };
  }
  if (head.length >= 6 && asciiAt(head, 0, 6).startsWith('GIF8')) {
    return { mimeType: 'image/gif', kind: 'IMAGE', extension: 'gif' };
  }
  if (
    head.length >= 12 &&
    asciiAt(head, 0, 4) === 'RIFF' &&
    asciiAt(head, 8, 4) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', kind: 'IMAGE', extension: 'webp' };
  }
  if (
    head.length >= 12 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    return { mimeType: 'video/mp4', kind: 'VIDEO', extension: 'mp4' };
  }
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return { mimeType: 'video/webm', kind: 'VIDEO', extension: 'webm' };
  }
  if (head.length >= 5 && asciiAt(head, 0, 5) === '%PDF-') {
    return { mimeType: 'application/pdf', kind: 'FILE', extension: 'pdf' };
  }
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)
  ) {
    return { mimeType: 'application/zip', kind: 'FILE', extension: 'zip' };
  }
  if (
    head.length >= 8 &&
    head[0] === 0xd0 &&
    head[1] === 0xcf &&
    head[2] === 0x11 &&
    head[3] === 0xe0
  ) {
    return { mimeType: 'application/msword', kind: 'FILE', extension: 'doc' };
  }
  if (isTextLike(textSample)) {
    return { mimeType: 'text/plain', kind: 'FILE', extension: 'txt' };
  }
  return null;
}
