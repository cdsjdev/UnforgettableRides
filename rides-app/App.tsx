import React from 'react';
import { Platform, View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator, RootTabParamList } from './src/navigation/AppNavigator';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

/**
 * Convert replaceState → pushState when the URL pathname actually changes so
 * browser back/forward works across tab switches in the web build.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined' && !(window as any).__ridesHistoryPatched) {
  (window as any).__ridesHistoryPatched = true;
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = function (state: any, title: string, url?: string | URL | null) {
    const currentPath = window.location.pathname;
    const newPath = url != null ? new URL(String(url), window.location.href).pathname : currentPath;
    if (newPath !== currentPath) {
      window.history.pushState(state, title, url);
    } else {
      originalReplaceState(state, title, url);
    }
  };
}

const linking: LinkingOptions<RootTabParamList> = {
  prefixes: [],
  config: {
    screens: {
      Home: {
        path: '',
        screens: {
          HomeMain: '',
        },
      },
      Cars: {
        path: 'cars',
        screens: {
          CarsMain: '',
          CarDetail: ':carId',
          BookCar: ':carId/book',
        },
      },
      Messages: {
        path: 'messages',
        screens: {
          MessagesMain: '',
          MessageThread: ':threadId',
        },
      },
      Profile: {
        path: 'profile',
        screens: {
          ProfileMain: '',
          BookingsList: 'bookings',
          MyListings: 'listings',
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
          ResetPassword: 'reset-password',
          Help: 'help',
          Feedback: 'feedback',
          Notifications: 'notifications',
        },
      },
    },
  },
};

function WebGlobalStyles() {
  if (Platform.OS !== 'web') return null;
  return (
    <style
      // @ts-ignore
      dangerouslySetInnerHTML={{
        __html: `
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0d0d0d;
          }
          *, *::before, *::after {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          [role="button"] { cursor: pointer; transition: opacity 0.15s; }
          [role="button"]:focus:not(:focus-visible) { outline: none; }
          [role="button"]:hover { opacity: 0.85; }
          input:focus, textarea:focus { outline: none; box-shadow: none; }
        `,
      }}
    />
  );
}

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#c9a84c" />
      </View>
    );
  }

  return (
    <NavigationContainer
      linking={Platform.OS === 'web' ? linking : undefined}
      documentTitle={{
        formatter: (options, route) => {
          const title = options?.title || route?.name || 'UnforgettableRides';
          return `${title} | UnforgettableRides`;
        },
      }}
    >
      <AppNavigator />
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WebGlobalStyles />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0d0d',
  },
});
