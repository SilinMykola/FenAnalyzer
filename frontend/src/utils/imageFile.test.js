import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, getImageFileError, readImageAsBase64 } from './imageFile';

// A File whose reported size can be faked without allocating megabytes.
function fakeFile(type, size = 100) {
  const file = new File(['x'], 'board', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('getImageFileError', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(getImageFileError(fakeFile(type))).toBeNull();
  });

  it.each(['image/gif', 'application/pdf', ''])('rejects type "%s"', (type) => {
    expect(getImageFileError(fakeFile(type))).toBe('Use a PNG, JPEG or WebP image.');
  });

  it('accepts an image of exactly 10 MB', () => {
    expect(getImageFileError(fakeFile('image/png', MAX_IMAGE_BYTES))).toBeNull();
  });

  it('rejects an image over 10 MB', () => {
    expect(getImageFileError(fakeFile('image/png', MAX_IMAGE_BYTES + 1))).toBe(
      'The image is larger than 10 MB.'
    );
  });
});

describe('readImageAsBase64', () => {
  it('returns the bytes as plain base64', async () => {
    const file = new File(['chess'], 'board.png', { type: 'image/png' });

    await expect(readImageAsBase64(file)).resolves.toBe(btoa('chess'));
  });

  it('reads a clipboard blob the same way', async () => {
    const blob = new Blob(['board'], { type: 'image/png' });

    await expect(readImageAsBase64(blob)).resolves.toBe(btoa('board'));
  });
});
