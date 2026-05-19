import type { ServiceCategory } from "@groupio/types";
import React from "react";
import { StyleSheet } from "react-native";
import { Chip, useTheme } from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { CATEGORY_LABELS } from "../lib/categoryLabels";

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
