import React from "react";
import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

interface TabIconProps {
  name: string;
  color: string;
  size: number;
}

function TabIcon({ name, color, size }: TabIconProps) {
  return <Icon name={name} size={size} color={color} />;
}

export default function TabLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.outlineVariant,
        },
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 18,
          color: theme.colors.onSurface,
        },
        headerTitleAlign: "center",
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.outlineVariant,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
          elevation: 8,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "\u05D1\u05D9\u05EA",
          headerTitle: "Groupio",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="offers"
        options={{
          title: "\u05D4\u05E6\u05E2\u05D5\u05EA",
          headerTitle: "\u05D4\u05E6\u05E2\u05D5\u05EA \u05E7\u05D1\u05D5\u05E6\u05EA\u05D9\u05D5\u05EA",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="tag-multiple" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "\u05E6'\u05D0\u05D8",
          headerTitle: "\u05E2\u05D5\u05D6\u05E8 AI",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="chat-processing" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "\u05E4\u05E8\u05D5\u05E4\u05D9\u05DC",
          headerTitle: "\u05D4\u05E4\u05E8\u05D5\u05E4\u05D9\u05DC \u05E9\u05DC\u05D9",
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="account-circle" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
