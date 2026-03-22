import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Localization from "expo-localization";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { createContext, useCallback, useContext , useEffect, useState } from "react";
import { I18nManager, Platform , useColorScheme } from "react-native";
import {
  PaperProvider,
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadAuthToken, clearAuthSession } from "../lib/api";
import {
  registerForPushNotifications,
  sendPushTokenToServer,
  setupNotificationNavigation,
} from "../lib/notifications";

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Enable RTL only when the device locale is Hebrew (or Arabic).
// Forcing RTL unconditionally breaks English-locale users.
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? "he";
const isRTLLocale = deviceLocale === "he" || deviceLocale === "ar";
if (isRTLLocale && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
} else if (!isRTLLocale && I18nManager.isRTL) {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

// Configure the QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Custom theme colors for Groupio
const groupioColors = {
  primary: "#1a9a76",
  primaryContainer: "#d1f0e6",
  secondary: "#f59e0b",
  secondaryContainer: "#fef3c7",
  tertiary: "#2E7D32",
  tertiaryContainer: "#C8E6C9",
  error: "#D32F2F",
  errorContainer: "#FFCDD2",
  surface: "#FFFFFF",
  surfaceVariant: "#F5F5F5",
  background: "#FAFAFA",
  onPrimary: "#FFFFFF",
  onPrimaryContainer: "#065f46",
  onSecondary: "#FFFFFF",
  onSecondaryContainer: "#92400e",
  onTertiary: "#FFFFFF",
  onTertiaryContainer: "#1B5E20",
  onError: "#FFFFFF",
  onErrorContainer: "#B71C1C",
  onSurface: "#212121",
  onSurfaceVariant: "#616161",
  onBackground: "#212121",
  outline: "#BDBDBD",
  outlineVariant: "#E0E0E0",
  inverseSurface: "#303030",
  inverseOnSurface: "#F5F5F5",
  inversePrimary: "#6ee7b7",
  shadow: "#000000",
  scrim: "#000000",
  backdrop: "rgba(0, 0, 0, 0.4)",
  elevation: {
    level0: "transparent",
    level1: "#FFFFFF",
    level2: "#F5F5F5",
    level3: "#EEEEEE",
    level4: "#E0E0E0",
    level5: "#BDBDBD",
  },
};

const groupioDarkColors = {
  primary: "#6ee7b7",
  primaryContainer: "#065f46",
  secondary: "#fbbf24",
  secondaryContainer: "#92400e",
  tertiary: "#81C784",
  tertiaryContainer: "#1B5E20",
  error: "#EF9A9A",
  errorContainer: "#B71C1C",
  surface: "#121212",
  surfaceVariant: "#1E1E1E",
  background: "#121212",
  onPrimary: "#065f46",
  onPrimaryContainer: "#d1f0e6",
  onSecondary: "#92400e",
  onSecondaryContainer: "#fef3c7",
  onTertiary: "#1B5E20",
  onTertiaryContainer: "#C8E6C9",
  onError: "#B71C1C",
  onErrorContainer: "#FFCDD2",
  onSurface: "#EEEEEE",
  onSurfaceVariant: "#BDBDBD",
  onBackground: "#EEEEEE",
  outline: "#616161",
  outlineVariant: "#424242",
  inverseSurface: "#EEEEEE",
  inverseOnSurface: "#303030",
  inversePrimary: "#1a9a76",
  shadow: "#000000",
  scrim: "#000000",
  backdrop: "rgba(0, 0, 0, 0.6)",
  elevation: {
    level0: "transparent",
    level1: "#1E1E1E",
    level2: "#232323",
    level3: "#282828",
    level4: "#2C2C2C",
    level5: "#333333",
  },
};

const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...groupioColors,
  },
};

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...groupioDarkColors,
  },
};

const { LightTheme: navLightTheme, DarkTheme: navDarkTheme } =
  adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
    materialLight: lightTheme,
    materialDark: darkTheme,
  });

type AuthContextValue = {
  isAuthenticated: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within RootLayout");
  return ctx;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const paperTheme = isDark ? darkTheme : lightTheme;
  const navigationTheme = isDark ? navDarkTheme : navLightTheme;
  const router = useRouter();
  const segments = useSegments();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const logout = useCallback(async () => {
    await clearAuthSession();
    setIsAuthenticated(false);
    router.replace("/(auth)/login");
  }, [router]);

  useEffect(() => {
    // Restore token from SecureStore and redirect accordingly
    loadAuthToken().then((token) => {
      setIsAuthenticated(!!token);
      setAuthChecked(true);
      SplashScreen.hideAsync();
    });
  }, []);

  useEffect(() => {
    if (!authChecked) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated — redirect to login
      router.replace("/(auth)/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Already authenticated — redirect to main app
      router.replace("/(tabs)");
    }
  }, [authChecked, isAuthenticated, segments]);

  useEffect(() => {
    if (!isAuthenticated) return;
    return setupNotificationNavigation({
      push: (href: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(href as any);
      },
    });
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    registerForPushNotifications().then((result) => {
      if (result.token) {
        sendPushTokenToServer(result.token);
      }
    });
  }, [isAuthenticated]);

  if (!authChecked) {
    // Splash is still visible while we check auth
    return null;
  }

  const authContextValue: AuthContextValue = {
    isAuthenticated,
    logout,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <SafeAreaProvider>
            <ThemeProvider value={navigationTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen
                name="create-offer"
                options={{
                  headerShown: false,
                  presentation: "modal",
                  animation: "slide_from_bottom",
                }}
              />
              <Stack.Screen
                name="offer-detail"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
              <Stack.Screen
                name="contractor-offers"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
              <Stack.Screen
                name="contractor-projects"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
              <Stack.Screen
                name="checkout"
                options={{
                  headerShown: false,
                  presentation: "modal",
                  animation: "slide_from_bottom",
                }}
              />
              <Stack.Screen
                name="order-detail"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
              <Stack.Screen
                name="building"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
              <Stack.Screen
                name="payments"
                options={{
                  headerShown: false,
                  animation: "slide_from_right",
                }}
              />
            </Stack>
            <StatusBar style={isDark ? "light" : "dark"} />
          </ThemeProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
    </AuthContext.Provider>
  );
}
