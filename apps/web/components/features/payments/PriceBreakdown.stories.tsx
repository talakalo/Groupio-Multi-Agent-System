import type { Meta, StoryObj } from "@storybook/react";
import { PriceBreakdown } from "./PriceBreakdown";

const meta: Meta<typeof PriceBreakdown> = {
  title: "Features/Payments/PriceBreakdown",
  component: PriceBreakdown,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof PriceBreakdown>;

export const WithDiscount: Story = {
  args: {
    items: [
      { label: "מחיר בסיס", amount: 5000, type: "regular" },
      { label: "הנאה", amount: -500, type: "discount" },
      { label: "סיכום ביניים", amount: 4500, type: "subtotal" },
      { label: "מע\"מ", amount: 765, type: "tax" },
      { label: "סה\"כ לתשלום", amount: 5265, type: "total" },
    ],
    currency: "ILS",
  },
};

export const WithoutDiscount: Story = {
  args: {
    items: [
      { label: "מחיר בסיס", amount: 5000, type: "regular" },
      { label: "סיכום ביניים", amount: 5000, type: "subtotal" },
      { label: "מע\"מ", amount: 850, type: "tax" },
      { label: "סה\"כ לתשלום", amount: 5850, type: "total" },
    ],
    currency: "ILS",
  },
};
