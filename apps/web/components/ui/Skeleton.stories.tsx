import type { Meta, StoryObj } from "@storybook/react";

import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "UI/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["text", "card", "avatar", "stat", "table-row"],
    },
    count: { control: { type: "number", min: 1, max: 10 } },
  },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Text: Story = { args: { variant: "text" } };
export const Card: Story = { args: { variant: "card" } };
export const Avatar: Story = { args: { variant: "avatar" } };
export const Stat: Story = { args: { variant: "stat" } };
export const TableRow: Story = { args: { variant: "table-row" } };
export const Count: Story = { args: { variant: "text", count: 5 } };
