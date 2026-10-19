import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { InvitationManagement } from "@/components/admin/invitation-management";

const provider = vi.hoisted(() => ({ listUserInvitations: vi.fn(), revokeUserInvitation: vi.fn(), replaceUserInvitation: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => provider }));
const invitation = { id: "link-1", name: "New Operator", email: "new@example.test", role: "user", createdAt: "2026-10-01T00:00:00Z", expiresAt: "2099-10-02T00:00:00Z", status: "pending" };

beforeEach(() => {
  Object.values(provider).forEach((mock) => mock.mockReset());
  provider.listUserInvitations.mockResolvedValue([invitation]);
});

it("shows expiry and status and confirms before revoking a link", async () => {
  provider.revokeUserInvitation.mockResolvedValue({ ...invitation, status: "revoked" });
  render(<InvitationManagement refreshKey={0} />);
  expect(await screen.findByText("New Operator")).toBeVisible();
  expect(screen.getByText("Pending")).toBeVisible();
  expect(screen.getByText(/2099/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/cannot use this link/i)).toBeVisible();
  await userEvent.click(within(dialog).getByRole("button", { name: "Revoke link" }));
  expect(await screen.findByText("Revoked")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
});

it("generates and displays a replacement once, with no browser persistence", async () => {
  provider.replaceUserInvitation.mockResolvedValue({ ...invitation, id: "link-2", activationUrl: "/activate?token=replacement-token" });
  render(<InvitationManagement refreshKey={0} />);
  await userEvent.click(await screen.findByRole("button", { name: "Replace link" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Generate replacement" }));
  expect(await screen.findByText(/activate\?token=replacement-token/)).toBeVisible();
  expect(localStorage.getItem("replacement-token")).toBeNull();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Done" }));
  expect(screen.queryByText(/replacement-token/)).not.toBeInTheDocument();
});

it("shows a retry instead of pretending no links exist when listing fails", async () => {
  provider.listUserInvitations.mockRejectedValueOnce(new Error("network unavailable"));
  render(<InvitationManagement refreshKey={0} />);
  expect(await screen.findByRole("button", { name: "Try Again" })).toBeVisible();
  expect(screen.queryByText("No activation links yet")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
  expect(await screen.findByText("New Operator")).toBeVisible();
});

it("requires the acting administrator code when replacing an admin link", async () => {
  provider.listUserInvitations.mockResolvedValue([{ ...invitation, role: "admin" }]);
  render(<InvitationManagement refreshKey={0} />);
  await userEvent.click(await screen.findByRole("button", { name: "Replace link" }));
  expect(screen.getByRole("button", { name: "Generate replacement" })).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Your authenticator code"), "123456");
  provider.replaceUserInvitation.mockResolvedValue({ ...invitation, activationUrl: "/activate?token=admin-replacement" });
  await userEvent.click(screen.getByRole("button", { name: "Generate replacement" }));
  expect(await screen.findByText(/admin-replacement/)).toBeVisible();
});
