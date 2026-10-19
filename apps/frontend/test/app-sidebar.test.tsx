import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { testUsers } from "@/test/fixtures/domain";

const authMock = vi.hoisted(() => ({
  activePersona: null as (typeof testUsers)[number] | null,
  logout: vi.fn(),
}));

vi.mock("@/components/auth/auth-context", () => ({
  useAuth: () => authMock,
}));

vi.mock("@/components/simulator/simulation-run-status-context", () => ({
  useSimulationRunStatus: () => ({
    status: "idle",
    hasUnviewedCompletedRun: false,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

function renderSidebar() {
  return render(
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    authMock.activePersona = testUsers[1];
    globalThis.__nextNavigationMock.pathname = "/dashboard";
  });

  it("reserves the active indicator width for every navigation item", () => {
    const { container } = renderSidebar();

    const activeItem = screen.getByRole("link", { name: "Dashboard" });
    const inactiveItem = screen.getByRole("link", { name: "Machines" });

    expect(activeItem).toHaveAttribute("data-active", "true");
    expect(inactiveItem).toHaveAttribute("data-active", "false");
    expect(activeItem).toHaveClass("border-l-2", "border-transparent");
    expect(inactiveItem).toHaveClass("border-l-2", "border-transparent");
    expect(activeItem.className).toContain(
      "data-[active=true]:border-sidebar-primary",
    );
    expect(container.querySelector('[data-sidebar="header"]')).toHaveClass(
      "group-data-[collapsible=icon]:px-2",
    );
    expect(container.querySelector('[data-sidebar="separator"]')).toHaveClass(
      "mx-3",
      "group-data-[collapsible=icon]:mx-2",
    );
  });

  it("hides Administration from non-admin users and keeps Account Security in the account menu", async () => {
    const user = userEvent.setup();
    renderSidebar();

    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Account Security" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(
      screen.getByRole("menuitem", { name: "Account Security" }),
    ).toHaveAttribute("href", "/account/security");
  });

  it("shows only the Admin destination in the Administration group for admins", async () => {
    const user = userEvent.setup();
    authMock.activePersona = testUsers[0];
    renderSidebar();

    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(
      screen.queryByRole("link", { name: "Account Security" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(
      screen.getByRole("menuitem", { name: "Account Security" }),
    ).toHaveAttribute("href", "/account/security");
  });
});
