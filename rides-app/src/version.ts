import pkg from '../package.json';

const rawBuildDate = process.env.EXPO_PUBLIC_BUILD_DATE || 'unknown';
const rawBuildSha = process.env.EXPO_PUBLIC_GIT_SHA || process.env.EXPO_PUBLIC_COMMIT_SHA || 'unknown';
const formattedBuildDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBuildDate) ? rawBuildDate.replace(/-/g, '') : rawBuildDate;

export const APP_VERSION = pkg.version;
export const APP_BUILD_DATE = rawBuildDate;
export const APP_BUILD_SHA = rawBuildSha === 'unknown' ? rawBuildSha : rawBuildSha.slice(0, 7);
const computedBuildVersionParts = [formattedBuildDate, APP_BUILD_SHA].filter((value) => value !== 'unknown');
export const APP_DISPLAY_VERSION = computedBuildVersionParts.length > 0
  ? `${APP_VERSION}+${computedBuildVersionParts.join('.')}`
  : APP_VERSION;

