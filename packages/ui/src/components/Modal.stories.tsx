import type { Meta, StoryObj } from "@storybook/react";
import { fn, userEvent, within, expect } from "@storybook/test";
import { useState } from "react";
import { Modal, ModalBody, ModalFooter } from "./Modal";
import { Button } from "./Button";

const meta = {
  title: "Design System/Modal",
  component: Modal,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "md", "lg", "xl", "full"],
    },
    showCloseButton: { control: "boolean" },
    closeOnOverlayClick: { control: "boolean" },
  },
  args: {
    title: "Modal title",
    description: "Optional supporting description text.",
    size: "md",
    showCloseButton: true,
    closeOnOverlayClick: true,
    onClose: fn(),
    // Modal requires children; provide a default below
    children: null,
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Controlled wrapper so Storybook can open/close the modal
// ---------------------------------------------------------------------------

function ModalDemo({ size = "md" as const, ...props }: React.ComponentProps<typeof Modal>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal {...props} size={size} isOpen={open} onClose={() => setOpen(false)}>
        <ModalBody>
          <p className="text-sm text-gray-600">
            This is the modal body. It can contain any content — forms, confirmations, or
            detail views.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>Confirm</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  render: (args) => <ModalDemo {...args} />,
};

export const Small: Story = {
  args: { size: "sm", title: "Compact dialog" },
  render: (args) => <ModalDemo {...args} />,
};

export const Large: Story = {
  args: { size: "lg", title: "Wide dialog" },
  render: (args) => <ModalDemo {...args} />,
};

export const NoCloseButton: Story = {
  args: { showCloseButton: false, closeOnOverlayClick: false, title: "Must use buttons to close" },
  render: (args) => <ModalDemo {...args} />,
};

// ---------------------------------------------------------------------------
// Interaction test — open the modal and verify it renders
// ---------------------------------------------------------------------------

export const InteractionTest: Story = {
  render: (args) => <ModalDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /open modal/i });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("dialog")).toBeInTheDocument();
    const closeBtn = canvas.getByRole("button", { name: /cancel/i });
    await userEvent.click(closeBtn);
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
  },
};
