import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import AdminUsersPage from "@/app/(protected)/admin/users/page";
import { testUsers } from "@/test/fixtures/domain";

const state = vi.hoisted(() => ({ provider: { listUsers: vi.fn(), listMachines: vi.fn(), getUserMachineAccess: vi.fn(), updateUserAccess: vi.fn() }, refreshUsers: vi.fn(), replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => state.provider }));
vi.mock("@/components/auth/auth-context", () => ({ useAuth: () => ({ activePersona: { id: "user-001", role: "admin" }, refreshUsers: state.refreshUsers }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, push: state.push, refresh: state.refresh }) }));

it("saves self-demotion atomically and returns to login without loading admin data again", async () => {
  HTMLElement.prototype.scrollIntoView = () => {};
  state.provider.listUsers.mockResolvedValue(testUsers);
  state.provider.listMachines.mockResolvedValue([]);
  state.provider.getUserMachineAccess.mockResolvedValue([]);
  state.provider.updateUserAccess.mockResolvedValue({ user: { ...testUsers[0], role: "user" }, entityIds: [], sessionRevoked: true });
  state.refreshUsers.mockResolvedValue([]);
  render(<AdminUsersPage />);
  const row = (await screen.findByText(testUsers[0].name)).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Manage access" }));
  screen.getByRole("combobox", { name: "Role" }).focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.click(screen.getByRole("option", { name: "Standard user" }));
  await userEvent.click(screen.getByRole("button", { name: "Save access" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
  expect(state.provider.updateUserAccess).toHaveBeenCalledWith("user-001", { role: "user", machineIds: [], stepUpCode: undefined });
  expect(state.replace).toHaveBeenCalledWith("/login");
  expect(state.provider.listUsers).toHaveBeenCalledTimes(1);
});
