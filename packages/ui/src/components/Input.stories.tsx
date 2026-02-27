import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta = {
  title: "Design System/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "error", "success"],
    },
    inputSize: {
      control: "select",
      options: ["default", "sm", "lg"],
    },
    label: { control: "text" },
    placeholder: { control: "text" },
    error: { control: "text" },
    hint: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: {
    placeholder: "Enter value…",
    variant: "default",
    inputSize: "default",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { label: "Email", placeholder: "you@example.com", type: "email" },
};

export const WithHint: Story = {
  args: {
    label: "Username",
    placeholder: "john_doe",
    hint: "Must be 3–30 characters, letters and underscores only.",
  },
};

export const ErrorState: Story = {
  args: {
    label: "Password",
    type: "password",
    variant: "error",
    error: "Password must be at least 8 characters.",
    defaultValue: "abc",
  },
};

export const SuccessState: Story = {
  args: {
    label: "Username",
    variant: "success",
    defaultValue: "john_doe",
    hint: "Username is available.",
  },
};

export const Disabled: Story = {
  args: { label: "Read-only field", defaultValue: "Cannot edit", disabled: true },
};

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

export const Small: Story = {
  args: { label: "Compact input", inputSize: "sm", placeholder: "Small…" },
};

export const Large: Story = {
  args: { label: "Large input", inputSize: "lg", placeholder: "Large…" },
};
