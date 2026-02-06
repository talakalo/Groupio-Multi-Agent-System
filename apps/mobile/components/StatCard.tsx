import React from "react";
import { StyleSheet, View } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  iconColor?: string;
  backgroundColor?: string;
}

export function StatCard({
  title,
  value,
  icon,
  iconColor,
  backgroundColor,
}: StatCardProps) {
  const theme = useTheme();

  const resolvedIconColor = iconColor ?? theme.colors.primary;
  const resolvedBg = backgroundColor ?? theme.colors.primaryContainer;

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]} mode="elevated">
      <Card.Content style={styles.content}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: resolvedBg },
          ]}
        >
          <Icon name={icon} size={28} color={resolvedIconColor} />
        </View>
        <Text
          variant="headlineMedium"
          style={[styles.value, { color: theme.colors.onSurface }]}
        >
          {value}
        </Text>
        <Text
          variant="bodySmall"
          style={[styles.title, { color: theme.colors.onSurfaceVariant }]}
        >
          {title}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    elevation: 2,
  },
  content: {
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  value: {
    fontWeight: "800",
    fontSize: 28,
    lineHeight: 34,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
});

export default StatCard;
