import React from "react";
import { StyleSheet } from "react-native";
import { Chip, useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { ServiceCategory } from "@groupio/types";

// Hebrew labels for service categories
const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ac_installation: "\u05D4\u05EA\u05E7\u05E0\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  ac_maintenance: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  kitchen: "\u05DE\u05D8\u05D1\u05D7\u05D9\u05DD",
  electrical: "\u05D7\u05E9\u05DE\u05DC",
  plumbing: "\u05D0\u05D9\u05E0\u05E1\u05D8\u05DC\u05E6\u05D9\u05D4",
  heating: "\u05D7\u05D9\u05DE\u05D5\u05DD",
  renovations: "\u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD",
  painting: "\u05E6\u05D1\u05D9\u05E2\u05D4",
  flooring: "\u05E8\u05D9\u05E6\u05D5\u05E3",
  windows: "\u05D7\u05DC\u05D5\u05E0\u05D5\u05EA",
  security: "\u05D0\u05D1\u05D8\u05D7\u05D4",
};

// Icons for each category
const CATEGORY_ICONS: Record<ServiceCategory, string> = {
  ac_installation: "air-conditioner",
  ac_maintenance: "wrench",
  kitchen: "countertop",
  electrical: "flash",
  plumbing: "pipe",
  heating: "radiator",
  renovations: "hammer",
  painting: "format-paint",
  flooring: "view-dashboard",
  windows: "window-closed-variant",
  security: "shield-check",
};

// "All" label
const ALL_LABEL = "\u05D4\u05DB\u05DC";

interface CategoryChipProps {
  category: ServiceCategory | "all";
  selected?: boolean;
  onPress?: (category: ServiceCategory | "all") => void;
}

export function CategoryChip({
  category,
  selected = false,
  onPress,
}: CategoryChipProps) {
  const theme = useTheme();

  const label = category === "all" ? ALL_LABEL : CATEGORY_LABELS[category];
  const iconName = category === "all" ? "view-grid" : CATEGORY_ICONS[category];

  const handlePress = () => {
    if (onPress) {
      onPress(category);
    }
  };

  return (
    <Chip
      mode={selected ? "flat" : "outlined"}
      selected={selected}
      onPress={handlePress}
      icon={() => (
        <Icon
          name={iconName}
          size={18}
          color={
            selected
              ? theme.colors.onPrimary
              : theme.colors.onSurfaceVariant
          }
        />
      )}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: theme.colors.primary }
          : {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
            },
      ]}
      textStyle={[
        styles.chipText,
        {
          color: selected
            ? theme.colors.onPrimary
            : theme.colors.onSurfaceVariant,
        },
      ]}
      showSelectedCheck={false}
    >
      {label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: {
    marginEnd: 8,
    borderRadius: 20,
    height: 36,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});

export default CategoryChip;
