import type { Meta, StoryObj } from "@storybook/react";
import { Breadcrumb } from "./Breadcrumb";

const meta: Meta<typeof Breadcrumb> = {
  title: "Shared/Breadcrumb",
  component: Breadcrumb,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Breadcrumb>;

export const ThreeItems: Story = {
  args: {
    items: [
      { label: "דף הבית", href: "/dashboard" },
      { label: "ההצעות", href: "/offers" },
      { label: "פרטי הצעה" },
    ],
  },
};

export const TwoItems: Story = {
  args: {
    items: [
      { label: "ההצעות", href: "/offers" },
      { label: "שליחות" },
    ],
  },
};
