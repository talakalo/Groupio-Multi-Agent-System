import type { Meta, StoryObj } from "@storybook/react";

import { AttentionBanner } from "./AttentionBanner";

const meta: Meta<typeof AttentionBanner> = {
  title: "Shared/AttentionBanner",
  component: AttentionBanner,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof AttentionBanner>;

export const Warning: Story = {
  args: {
    variant: "warning",
    title: "שים לב",
    children: "נא לוודא שהפרטים שהוזנו נכונים לפני המשך.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    title: "שגיאה",
    children: "אירעה שגיאה בטעינת הנתונים. נסה שוב.",
  },
};

export const Info: Story = {
  args: {
    variant: "info",
    title: "מידע",
    children: "עדכון: ההצעות יעודכנו תוך 24 שעות.",
  },
};

export const WithAction: Story = {
  args: {
    variant: "warning",
    title: "אימות נדרש",
    children: "יש לאמת את פרטי החשבון לפני ביצוע התשלום.",
    action: { label: "אמת עכשיו", onClick: () => {} },
  },
};
