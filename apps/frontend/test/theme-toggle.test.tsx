import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "@/components/layout/theme-toggle";

const theme = vi.hoisted(() => ({ value: "light", setTheme: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: theme.value, setTheme: theme.setTheme }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    theme.value = "light";
    theme.setTheme.mockReset();
  });

  it("switches from light to dark monitoring mode", async () => {
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: /switch to dark monitoring mode/i }));

    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light monitoring mode", async () => {
    theme.value = "dark";
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: /switch to light monitoring mode/i }));

    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });
});
