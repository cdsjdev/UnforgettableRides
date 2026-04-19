import { useMemo } from 'react';
import { PanResponder, Platform, useWindowDimensions } from 'react-native';

const ROOT_TABS = ['Home', 'Dogs', 'Social', 'Shop', 'Care'] as const;
const EDGE_WIDTH = 56;
const ACTIVATION_DX = 12;
const COMMIT_DX = 72;

export function useRootTabSwipe(navigation: any, enabled = true) {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    const shouldClaimSwipe = (gestureState: any) => {
      if (!enabled || Platform.OS === 'web') return false;
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      const fromLeftEdge = gestureState.x0 <= EDGE_WIDTH;
      const fromRightEdge = gestureState.x0 >= (width - EDGE_WIDTH);
      if (!fromLeftEdge && !fromRightEdge) return false;
      return absDx >= ACTIVATION_DX && absDx > absDy * 1.1;
    };

    const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => shouldClaimSwipe(gestureState),
      // Capture phase helps when nested ScrollView/FlatList would otherwise keep the responder.
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => shouldClaimSwipe(gestureState),
      onPanResponderRelease: (_evt, gestureState) => {
        if (!enabled || Platform.OS === 'web') return;
        const absDx = Math.abs(gestureState.dx);
        const absDy = Math.abs(gestureState.dy);
        if (absDx < COMMIT_DX || absDx <= absDy * 1.1) return;

        const parent = navigation?.getParent?.();
        const state = parent?.getState?.();
        const routeNames: string[] = Array.isArray(state?.routeNames)
          ? state.routeNames
          : ROOT_TABS.slice();
        const currentTab = state?.routes?.[state?.index ?? 0]?.name;
        const currentIndex = routeNames.findIndex((name) => name === currentTab);
        if (currentIndex < 0) return;

        const fromLeftEdge = gestureState.x0 <= EDGE_WIDTH;
        const fromRightEdge = gestureState.x0 >= (width - EDGE_WIDTH);

        let targetIndex = currentIndex;
        if (gestureState.dx > 0 && fromLeftEdge) {
          targetIndex = currentIndex - 1;
        } else if (gestureState.dx < 0 && fromRightEdge) {
          targetIndex = currentIndex + 1;
        }

        // Circular root-tab swipe (wrap first/last tabs).
        if (targetIndex < 0) targetIndex = routeNames.length - 1;
        if (targetIndex >= routeNames.length) targetIndex = 0;
        if (targetIndex === currentIndex) return;
        const targetTab = routeNames[targetIndex];
        if (!targetTab) return;
        parent.navigate(targetTab as never);
      },
      onPanResponderTerminationRequest: () => true,
    });
    return panResponder.panHandlers;
  }, [enabled, navigation, width]);
}
