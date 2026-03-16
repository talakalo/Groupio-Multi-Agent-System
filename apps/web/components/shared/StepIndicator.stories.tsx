import type { Meta, StoryObj } from "@storybook/react";
import { StepIndicator } from "./StepIndicator";

const meta: Meta<typeof StepIndicator> = {
  title: "Shared/StepIndicator",
  component: StepIndicator,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StepIndicator>;

const steps = [
  { label: "פרטים", description: "בדוק את פרטי ההזמנה" },
  { label: "תשלום", description: "בחר אמצעי תשלום" },
  { label: "אימות", description: "אמת את הנתונים" },
  { label: "סיום", description: "ההזמנה הושלמה" },
];

export const Step0: Story = {
  args: { steps, currentStep: 0 },
};

export const Step1: Story = {
  args: { steps, currentStep: 1 },
};

export const Step2: Story = {
  args: { steps, currentStep: 2 },
};

export const Step3Complete: Story = {
  args: { steps, currentStep: 3 },
};
