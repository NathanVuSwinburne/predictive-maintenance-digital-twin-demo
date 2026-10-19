import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UserInviteDialog } from "@/components/admin/user-invite-dialog";

const providerMock = vi.hoisted(() => ({ createUserInvitation: vi.fn() }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => providerMock }));

describe("admin user lifecycle", () => {
  it("starts a fresh invitation after closing a generated link", async () => {
    providerMock.createUserInvitation.mockResolvedValue({ activationUrl: "/activate?token=old-link", expiresAt: "2026-10-02T00:00:00Z" });
    function Harness() {
      const [open, setOpen] = useState(true);
      return <><button onClick={() => setOpen(true)}>Open invitation</button><UserInviteDialog open={open} onOpenChange={setOpen} machines={[]} onCreated={() => {}} /></>;
    }
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Username"), "first@example.com");
    await userEvent.type(screen.getByLabelText("Name"), "First");
    await userEvent.click(screen.getByRole("button", { name: "Generate activation link" }));
    await userEvent.click((await screen.findAllByRole("button", { name: "Close" }))[0]);
    await userEvent.click(screen.getByRole("button", { name: "Open invitation" }));
    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(screen.queryByText(/old-link/)).not.toBeInTheDocument();
  });
  it("shows the generated activation link without implying email delivery", async () => {
    providerMock.createUserInvitation.mockResolvedValue({
      id: "invitation-1",
      email: "new.user@example.com",
      name: "New User",
      role: "user",
      activationUrl: "/activate?token=one-time-token",
      expiresAt: "2026-09-28T00:00:00Z",
    });
    render(<UserInviteDialog open onOpenChange={vi.fn()} machines={[]} onCreated={vi.fn()} />);
    expect(screen.getByText(/No email will be sent/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Username"), "new.user@example.com");
    await userEvent.type(screen.getByLabelText("Name"), "New User");
    await userEvent.click(screen.getByRole("button", { name: "Generate activation link" }));
    await waitFor(() => expect(screen.getByText(/activate\?token=one-time-token/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(providerMock.createUserInvitation).toHaveBeenCalledWith(expect.objectContaining({ email: "new.user@example.com", role: "user" }));
  });

  it("keeps the activation link available with manual-copy guidance if clipboard access fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("permission denied"));
    providerMock.createUserInvitation.mockResolvedValue({ activationUrl: "/activate?token=manual-copy", expiresAt: "2026-10-02T00:00:00Z" });
    render(<UserInviteDialog open onOpenChange={vi.fn()} machines={[]} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Username"), "copy@example.com");
    await user.type(screen.getByLabelText("Name"), "Copy");
    await user.click(screen.getByRole("button", { name: "Generate activation link" }));
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Select the activation link and copy it manually.")).toBeVisible();
    expect(screen.getByText(/activate\?token=manual-copy/)).toBeVisible();
  });

  it("cannot dismiss a pending invitation and lose its one-time result", async () => {
    let resolve!: (value: unknown) => void;
    providerMock.createUserInvitation.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onOpenChange = vi.fn();
    render(<UserInviteDialog open onOpenChange={onOpenChange} machines={[]} onCreated={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Username"), "pending@example.com");
    await userEvent.type(screen.getByLabelText("Name"), "Pending");
    await userEvent.click(screen.getByRole("button", { name: "Generate activation link" }));
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalled();
    resolve({ activationUrl: "/activate?token=pending-result", expiresAt: "2026-10-02T00:00:00Z" });
    expect(await screen.findByText(/pending-result/)).toBeVisible();
  });
});
