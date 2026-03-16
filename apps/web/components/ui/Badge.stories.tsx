import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = { args: { children: "Default" } };
export const Primary: Story = { args: { children: "Primary", variant: "primary" } };
export const Success: Story = { args: { children: "Success", variant: "success" } };
export const Warning: Story = { args: { children: "Warning", variant: "warning" } };
export const Error: Story = { args: { children: "Error", variant: "error" } };
export const Accent: Story = { args: { children: "Accent", variant: "accent" } };
export const Info: Story = { args: { children: "Info", variant: "info" } };
export const Small: Story = { args: { children: "Small", size: "sm" } };
