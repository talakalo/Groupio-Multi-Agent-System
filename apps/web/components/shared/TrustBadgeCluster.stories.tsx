import type { Meta, StoryObj } from "@storybook/react";
import { TrustBadgeCluster } from "./TrustBadgeCluster";

const meta: Meta<typeof TrustBadgeCluster> = {
  title: "Shared/TrustBadgeCluster",
  component: TrustBadgeCluster,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof TrustBadgeCluster>;

export const Horizontal: Story = {
  args: {
    badges: ["verified", "escrow", "licensed", "insured"],
    layout: "horizontal",
  },
};

export const Vertical: Story = {
  args: {
    badges: ["verified", "escrow"],
    layout: "vertical",
  },
};

export const TwoBadges: Story = {
  args: {
    badges: ["verified", "escrow"],
    layout: "horizontal",
  },
};

export const SmallSize: Story = {
  args: {
    badges: ["verified", "escrow", "licensed"],
    layout: "horizontal",
    size: "sm",
  },
};
