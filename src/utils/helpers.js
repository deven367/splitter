// Constants
export const DEFAULT_GROUP_DISPLAY_NAME = 'Default Group';
export const INVALID_GROUP_NAME_CHARS = /[<>"'`]/;
export const INVALID_GROUP_NAME_CHARS_LIST = '<, >, ", \', or `';
export const RESERVED_FILENAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

/**
 * Encodes a UTF-8 string to base64 format required by GitHub API.
 */
export function utf8ToBase64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  ));
}

/**
 * Sanitizes a string for safe display in user-facing messages.
 */
export function sanitizeForDisplay(str) {
  return String(str).replace(/[<>]/g, '');
}

/**
 * Check if a filename base is a reserved name.
 */
export function isReservedFilename(baseName) {
  return RESERVED_FILENAMES.has((baseName || '').toLowerCase());
}

/**
 * Escapes a string for use in HTML attributes.
 */
export function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get data filename for a group.
 */
export function getDataFilename(groupName) {
  if (groupName === 'default') return 'data.json';

  let safeName = (groupName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  safeName = safeName.replace(/^_+|_+$/g, '');

  if (!safeName) {
    safeName = 'group';
  }

  if (isReservedFilename(safeName)) {
    safeName = `group_${safeName}`;
  }

  return `data_${safeName}.json`;
}
