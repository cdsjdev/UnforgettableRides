import pkg from '../package.json';

export const WEB_APP_VERSION = pkg.version;
const rawBuildDate = import.meta.env.VITE_BUILD_DATE || 'unknown';
const rawBuildSha = import.meta.env.VITE_GIT_SHA || import.meta.env.VITE_COMMIT_SHA || 'unknown';
const formattedBuildDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBuildDate) ? rawBuildDate.replace(/-/g, '') : rawBuildDate;

export const WEB_BUILD_DATE = rawBuildDate;
export const WEB_BUILD_SHA = rawBuildSha === 'unknown' ? rawBuildSha : rawBuildSha.slice(0, 7);
const computedBuildNumberParts = [formattedBuildDate, WEB_BUILD_SHA].filter((value) => value !== 'unknown');
export const WEB_BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER
  || (computedBuildNumberParts.length > 0 ? `${WEB_APP_VERSION}+${computedBuildNumberParts.join('.')}` : WEB_APP_VERSION);
