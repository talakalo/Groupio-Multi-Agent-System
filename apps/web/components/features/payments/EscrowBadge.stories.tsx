import type { Meta, StoryObj } from "@storybook/react";

import { EscrowBadge } from "./EscrowBadge";

const meta: Meta<typeof EscrowBadge> = {
  title: "Features/Payments/EscrowBadge",
  component: EscrowBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof EscrowBadge>;

export const Inline: Story = {
  args: { variant: "inline" },
};

export const Block: Story = {
  args: { variant: "block" },
};
