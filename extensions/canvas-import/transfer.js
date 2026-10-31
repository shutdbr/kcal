/** Krea's Canvas answers at both addresses. */
export const CANVAS_ORIGINS = ['https://canvas.krea.edu.in', 'https://krea.instructure.com'];
export const EXAM_ORIGIN = 'https://oe.krea.edu.in';

/** @param {string} value */
export function destinationUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter the full kcal address, including https://.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) {
    throw new Error('Use an HTTPS kcal address, or HTTP on localhost for development.');
  }
  if ([...CANVAS_ORIGINS, EXAM_ORIGIN].some((origin) => new URL(origin).hostname === url.hostname)) throw new Error('Enter the kcal address here, not the Canvas or Exam address.');
  url.search = '';
  url.hash = '';
  return url;
}

/** @param {string} destination
 * @param {unknown} payload */
export function importUrl(destination, payload) {
  const url = destinationUrl(destination);
  // Fragments are not sent in the HTTP request. kcal removes this on arrival.
  url.hash = `canvas-import=${encodeURIComponent(JSON.stringify(payload))}`;
  return url.href;
}
