import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { UserAccessDialog } from "@/components/admin/user-access-dialog";
import { testMachines, testUsers } from "@/test/fixtures/domain";

it("keeps a failed access draft editable and submits the selected machine on retry", async () => {
  let saved: unknown;
  const props = { isOpen: true, isSaving: false, error: null, machines: testMachines, user: { ...testUsers[1], machineIds: [] }, onOpenChange: vi.fn(), onSave: async (input: unknown) => { saved = input; } };
  const { rerender } = render(<UserAccessDialog {...props} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "Give access to Machine A" }));
  rerender(<UserAccessDialog {...props} error={{ title: "Access not saved", message: "Try again." }} />);
  expect(screen.getByRole("checkbox", { name: "Give access to Machine A" })).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Save access" }));
  expect(saved).toEqual({ userId: "user-002", role: "user", machineIds: ["machine-a"], stepUpCode: undefined });
});

it("lets a keyboard user reach and cancel the access dialog without saving", async () => {
  let closed = false;
  let saved = false;
  render(<UserAccessDialog isOpen isSaving={false} error={null} machines={testMachines} user={{ ...testUsers[0], machineIds: [] }} onOpenChange={(open) => { closed = !open; }} onSave={async () => { saved = true; }} />);
  screen.getByRole("button", { name: "Cancel" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(closed).toBe(true);
  expect(saved).toBe(false);
});
