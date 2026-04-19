import pkg from '../package.json';

export const WEB_APP_VERSION = pkg.version;
export const WEB_BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER || 'unknown';
export const WEB_BUILD_DATE = import.meta.env.VITE_BUILD_DATE || 'unknown';

const rawBuildSha = import.meta.env.VITE_GIT_SHA || import.meta.env.VITE_COMMIT_SHA || 'unknown';
export const WEB_BUILD_SHA = rawBuildSha === 'unknown' ? rawBuildSha : rawBuildSha.slice(0, 7);

