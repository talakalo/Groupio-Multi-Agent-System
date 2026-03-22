import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Test</Badge>);
    expect(screen.getByText("Test")).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(<Badge variant="success">Success</Badge>);
    const el = screen.getByText("Success");
    expect(el).toHaveClass("bg-emerald-100");
  });
});
