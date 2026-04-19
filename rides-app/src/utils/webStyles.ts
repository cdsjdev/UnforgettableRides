import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

/** Max content width for form/list screens (Profile, Appointments, BookAppointment, Advisor). */
export const WEB_MAX_WIDTH_CONTENT = 800;

/** Max content width for grid/dashboard screens (Home, CareDashboard). */
export const WEB_MAX_WIDTH_GRID = 1100;

const IS_WEB = Platform.OS === 'web';

const webContentStyles = IS_WEB
  ? StyleSheet.create({
      content: { maxWidth: WEB_MAX_WIDTH_CONTENT, width: '100%' as any, alignSelf: 'center' },
      grid: { maxWidth: WEB_MAX_WIDTH_GRID, width: '100%' as any, alignSelf: 'center' },
    })
  : null;

/**
 * Returns a containerStyle object that constrains content width on web.
 * Apply to ScrollView contentContainerStyle or outermost View style.
 */
export function useWebLayout(variant: 'content' | 'grid' = 'content') {
  const { width } = useWindowDimensions();
  const maxWidth = variant === 'grid' ? WEB_MAX_WIDTH_GRID : WEB_MAX_WIDTH_CONTENT;
  const isWide = IS_WEB && width > maxWidth;

  return {
    isWeb: IS_WEB,
    isWide,
    width,
    containerStyle: webContentStyles?.[variant],
  };
}

/**
 * Spread into any TouchableOpacity style to get cursor:pointer on web.
 * E.g. `style={[styles.card, WEB_CURSOR_POINTER]}`
 */
export const WEB_CURSOR_POINTER = IS_WEB
  ? ({ cursor: 'pointer' } as any)
  : undefined;
