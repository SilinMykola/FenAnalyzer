import { translate } from '../i18n';

// Image types the backend (and Gemini) accept, and the largest upload allowed.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Returns why the file cannot be used, or null when it is fine to upload.
 * t is the translate function of the interface language; English by default.
 */
export function getImageFileError(file, t = (key, params) => translate('en', key, params)) {
  if (!IMAGE_TYPES.includes(file.type)) {
    return t('image.error.type');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return t('image.error.size');
  }
  return null;
}

/** Reads a file (or clipboard blob) as base64, without the data: URL prefix. */
export function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}
