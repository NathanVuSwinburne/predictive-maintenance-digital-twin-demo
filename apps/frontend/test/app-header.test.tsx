import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

function renderHeader(pathname: string) {
  globalThis.__nextNavigationMock.pathname = pathname;

  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppHeader />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("AppHeader", () => {
  it("shows a title-cased page heading without breadcrumbs on top-level routes", () => {
    renderHeader("/knowledge");

    expect(
      screen.getByRole("heading", { level: 1, name: "Knowledge" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "breadcrumb" })).not.toBeInTheDocument();
  });

  it("shows breadcrumbs above the page heading on nested routes", () => {
    renderHeader("/admin/users");

    expect(
      screen.getByRole("navigation", { name: "breadcrumb" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "User Management" }),
    ).toBeInTheDocument();
  });

  it("labels the sidebar control for its next action", async () => {
    const user = userEvent.setup();
    renderHeader("/dashboard");

    const collapseButton = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    await user.click(collapseButton);

    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
  });
});
