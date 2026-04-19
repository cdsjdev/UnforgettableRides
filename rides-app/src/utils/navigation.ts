type NavLike = {
  canGoBack?: () => boolean;
  goBack?: () => void;
  navigate?: (routeName: string, params?: unknown) => void;
};

export function goBackOrNavigate(
  navigation: NavLike | null | undefined,
  fallbackRouteName: string,
  fallbackParams?: unknown
) {
  if (navigation?.canGoBack?.()) {
    navigation.goBack?.();
    return;
  }
  if (fallbackParams !== undefined) {
    navigation?.navigate?.(fallbackRouteName, fallbackParams);
    return;
  }
  navigation?.navigate?.(fallbackRouteName);
}
