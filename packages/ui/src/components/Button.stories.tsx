import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Design System/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    isLoading: { control: "boolean" },
    disabled: { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    children: "Button",
    variant: "default",
    size: "default",
    isLoading: false,
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const Default: Story = {};

export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete account" },
};

export const Outline: Story = {
  args: { variant: "outline", children: "Cancel" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Save draft" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Dismiss" },
};

export const Link: Story = {
  args: { variant: "link", children: "Learn more" },
};

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

export const Small: Story = {
  args: { size: "sm", children: "Small" },
};

export const Large: Story = {
  args: { size: "lg", children: "Large" },
};

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const Loading: Story = {
  args: { isLoading: true, children: "Saving…" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Unavailable" },
};

// ---------------------------------------------------------------------------
// All variants side-by-side (useful in Docs)
// ---------------------------------------------------------------------------

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-4">
      {(["default", "destructive", "outline", "secondary", "ghost", "link"] as const).map(
        (variant) => (
          <Button key={variant} variant={variant}>
            {variant.charAt(0).toUpperCase() + variant.slice(1)}
          </Button>
        ),
      )}
    </div>
  ),
};
