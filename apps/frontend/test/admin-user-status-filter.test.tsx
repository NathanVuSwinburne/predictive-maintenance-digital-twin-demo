import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import AdminUsersPage from "@/app/(protected)/admin/users/page";
import { testUsers } from "@/test/fixtures/domain";

const provider = vi.hoisted(() => ({ listUsers: vi.fn(), listMachines: vi.fn(), getUserMachineAccess: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => provider }));
vi.mock("@/components/auth/auth-context", () => ({ useAuth: () => ({ activePersona: { role: "admin" }, refreshUsers: vi.fn() }) }));

// jsdom has no layout/scroll implementation; keep the real Radix select.
const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = () => {}; });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScroll; });

it("combines status, role and search filters and can restore all statuses", async () => {
  provider.listUsers.mockResolvedValue([
    { ...testUsers[0], name: "Active Admin", status: undefined },
    { ...testUsers[1], name: "Suspended Operator", status: "suspended" },
    { ...testUsers[1], id: "disabled", name: "Deactivated Operator", status: "deactivated" },
  ]);
  provider.listMachines.mockResolvedValue([]);
  provider.getUserMachineAccess.mockResolvedValue([]);
  render(<AdminUsersPage />);
  expect(await screen.findByText("Active Admin")).toBeVisible();
  const choose = async (value: string) => {
    screen.getByRole("combobox", { name: "Filter by status" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("option", { name: value }));
  };
  await choose("Suspended");
  expect(screen.getByText("Suspended Operator")).toBeVisible();
  expect(screen.queryByText("Active Admin")).not.toBeInTheDocument();
  expect(screen.queryByText("Deactivated Operator")).not.toBeInTheDocument();
  await choose("Deactivated");
  expect(screen.getByText("Deactivated Operator")).toBeVisible();
  await userEvent.type(screen.getByLabelText("Search users"), "Suspended");
  expect(screen.getByText("No users match the current filters.")).toBeVisible();
  await userEvent.clear(screen.getByLabelText("Search users"));
  await choose("Active");
  expect(screen.getByText("Active Admin")).toBeVisible();
  await choose("All statuses");
  expect(screen.getByText("Suspended Operator")).toBeVisible();
  screen.getByRole("combobox", { name: "Filter by role" }).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("option", { name: "Admin" }));
  expect(screen.queryByText("Suspended Operator")).not.toBeInTheDocument();
  expect(screen.getByText("Active Admin")).toBeVisible();
});
