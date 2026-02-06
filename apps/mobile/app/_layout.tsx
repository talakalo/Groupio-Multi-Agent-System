import React from "react";
import { useEffect } from "react";
import { I18nManager, Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  PaperProvider,
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "react-native";

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Force RTL layout for Hebrew
if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
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
  primary: "#1976D2",
  primaryContainer: "#BBDEFB",
  secondary: "#FF6F00",
  secondaryContainer: "#FFE0B2",
  tertiary: "#2E7D32",
  tertiaryContainer: "#C8E6C9",
  error: "#D32F2F",
  errorContainer: "#FFCDD2",
  surface: "#FFFFFF",
  surfaceVariant: "#F5F5F5",
  background: "#FAFAFA",
  onPrimary: "#FFFFFF",
  onPrimaryContainer: "#0D47A1",
  onSecondary: "#FFFFFF",
  onSecondaryContainer: "#E65100",
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
  inversePrimary: "#90CAF9",
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
  primary: "#90CAF9",
  primaryContainer: "#0D47A1",
  secondary: "#FFB74D",
  secondaryContainer: "#E65100",
  tertiary: "#81C784",
  tertiaryContainer: "#1B5E20",
  error: "#EF9A9A",
  errorContainer: "#B71C1C",
  surface: "#121212",
  surfaceVariant: "#1E1E1E",
  background: "#121212",
  onPrimary: "#0D47A1",
  onPrimaryContainer: "#BBDEFB",
  onSecondary: "#E65100",
  onSecondaryContainer: "#FFE0B2",
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
  inversePrimary: "#1976D2",
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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const paperTheme = isDark ? darkTheme : lightTheme;
  const navigationTheme = isDark ? navDarkTheme : navLightTheme;

  useEffect(() => {
    // Hide splash screen after layout is ready
    SplashScreen.hideAsync();
  }, []);

  return (
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
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style={isDark ? "light" : "dark"} />
          </ThemeProvider>
        </SafeAreaProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
