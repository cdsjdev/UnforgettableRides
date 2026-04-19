import pkg from '../package.json';

const rawBuildDate = process.env.EXPO_PUBLIC_BUILD_DATE || 'unknown';
const rawBuildSha = process.env.EXPO_PUBLIC_GIT_SHA || process.env.EXPO_PUBLIC_COMMIT_SHA || 'unknown';

export const APP_VERSION = pkg.version;
export const APP_BUILD_DATE = rawBuildDate;
export const APP_BUILD_SHA = rawBuildSha === 'unknown' ? rawBuildSha : rawBuildSha.slice(0, 7);

