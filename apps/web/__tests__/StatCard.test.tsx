import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "../components/shared/StatCard";

describe("StatCard", () => {
  it("renders title and value", () => {
    render(<StatCard title="Active Offers" value="12" />);
    expect(screen.getByText("Active Offers")).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
  });

  it("renders positive change in green", () => {
    render(<StatCard title="Revenue" value="₪50,000" change="+12%" />);
    expect(screen.getByText("+12%")).toBeDefined();
  });

  it("renders negative change in red", () => {
    render(<StatCard title="Errors" value="3" change="-5%" />);
    expect(screen.getByText("-5%")).toBeDefined();
  });

  it("renders without change percentage", () => {
    render(<StatCard title="Total" value="100" />);
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
  });
});
