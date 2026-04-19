export const SOCIAL_MEDIA_DEFAULT_ASPECT_RATIO = 16 / 9;
export const SOCIAL_MEDIA_MIN_ASPECT_RATIO = 9 / 16;
export const SOCIAL_MEDIA_MAX_ASPECT_RATIO = 2;

export function clampSocialMediaAspectRatio(raw: number): number {
  return Math.max(SOCIAL_MEDIA_MIN_ASPECT_RATIO, Math.min(SOCIAL_MEDIA_MAX_ASPECT_RATIO, raw));
}

