import type { Meta, StoryObj } from "@storybook/react";
import {
  LoadingSpinner,
  LoadingOverlay,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
} from "./LoadingSpinner";

const meta = {
  title: "Design System/LoadingSpinner",
  component: LoadingSpinner,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl"],
    },
    color: {
      control: "select",
      options: ["primary", "white", "gray", "current"],
    },
    label: { control: "text" },
  },
  args: {
    size: "md",
    color: "primary",
    label: "Loading…",
  },
} satisfies Meta<typeof LoadingSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Spinner variants
// ---------------------------------------------------------------------------

export const Default: Story = {};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-6 p-4">
      <LoadingSpinner size="sm" label="Small" />
      <LoadingSpinner size="md" label="Medium" />
      <LoadingSpinner size="lg" label="Large" />
      <LoadingSpinner size="xl" label="XL" />
    </div>
  ),
};

export const OnDarkBackground: Story = {
  args: { color: "white" },
  parameters: {
    backgrounds: { default: "dark" },
  },
};

export const Gray: Story = {
  args: { color: "gray" },
};

// ---------------------------------------------------------------------------
// LoadingOverlay
// ---------------------------------------------------------------------------

export const Overlay: Story = {
  render: () => (
    <div className="relative h-48 w-full rounded-lg border bg-white">
      <p className="p-4 text-sm text-gray-400">Content behind the overlay</p>
      <LoadingOverlay />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Skeleton placeholders
// ---------------------------------------------------------------------------

export const Skeletons: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1">
          <SkeletonText lines={2} />
        </div>
      </div>
      <SkeletonCard />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  ),
};
