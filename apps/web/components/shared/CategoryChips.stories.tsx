import type { Meta, StoryObj } from "@storybook/react";
import { CategoryChips } from "./CategoryChips";

const meta: Meta<typeof CategoryChips> = {
  title: "Shared/CategoryChips",
  component: CategoryChips,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof CategoryChips>;

const categories = [
  { id: "all", label: "הכל", count: 42 },
  { id: "plumbing", label: "אינסטלציה", count: 12 },
  { id: "electrical", label: "חשמל", count: 8 },
  { id: "painting", label: "צבע", count: 15 },
];

export const WithCounts: Story = {
  args: {
    categories,
    selected: "all",
    onSelect: () => {},
  },
};

export const Selected: Story = {
  args: {
    categories,
    selected: "plumbing",
    onSelect: () => {},
  },
};

export const WithoutCounts: Story = {
  args: {
    categories: categories.map(({ id, label }) => ({ id, label })),
    selected: "all",
    onSelect: () => {},
  },
};
