import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

import HistoryPage from "@/app/(protected)/history/page";
import MachinesPage from "@/app/(protected)/machines/page";
import { testMachines, testUsers } from "@/test/fixtures/domain";
import type { HistoryEvent } from "@/lib/domain/types";

const state = vi.hoisted(() => ({
  provider: {
    listMachines: vi.fn(), listUsers: vi.fn(), listHistoryEvents: vi.fn(),
  },
}));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => state.provider }));
vi.mock("@/components/auth/auth-context", () => ({
  useAuth: () => ({ activePersona: testUsers[1] }),
}));
const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = () => {}; });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScroll; });

const event: HistoryEvent = {
  id: "event-1", type: "maintenance-action", timestamp: "2026-10-15T02:00:00Z",
  machineId: "machine-a", userId: "user-002", title: "Bearing inspected",
  description: "Inspection recorded by the supervisor.", severity: "low",
};
beforeEach(() => {
  vi.resetAllMocks();
  state.provider.listMachines.mockResolvedValue(testMachines);
  state.provider.listUsers.mockResolvedValue(testUsers);
  state.provider.listHistoryEvents.mockResolvedValue([event]);
});
it("history reports a failed initial request without claiming there are no matching events", async () => {
  state.provider.listHistoryEvents.mockRejectedValue(new Error("unavailable"));
  render(<HistoryPage />);
  expect(await screen.findByText("History could not be loaded")).toBeVisible();
  expect(screen.queryByText("No history records match the current filters.")).not.toBeInTheDocument();
  expect(screen.queryByText("0 events found.")).not.toBeInTheDocument();
});

it("history labels its existing filters and shows machine and operator names in the timeline", async () => {
  render(<HistoryPage />);
  expect(await screen.findByText("Bearing inspected")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "User" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Machine" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Event type" })).toBeEnabled();
  expect(screen.getByLabelText("From date")).toHaveAttribute("type", "date");
  expect(screen.getByLabelText("To date")).toHaveAttribute("type", "date");
  const timeline = screen.getByRole("region", { name: "History timeline" });
  expect(within(timeline).getByText("Machine A")).toBeVisible();
  expect(within(timeline).getByText("Line Supervisor")).toBeVisible();
  expect(within(timeline).queryByText("machine-a")).not.toBeInTheDocument();
});


it("history preserves its filters and labels previous results during a failed refresh, then recovers on retry", async () => {
  let unavailable = false;
  state.provider.listHistoryEvents.mockImplementation(async () => {
    if (unavailable) throw new Error("unavailable");
    return [event];
  });
  render(<HistoryPage />);
  expect(await screen.findByText("Bearing inspected")).toBeVisible();
  unavailable = true;
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-01" } });
  expect(await screen.findByText("History could not be loaded")).toBeVisible();
  expect(screen.getByText(/Showing previously loaded events/)).toBeVisible();
  expect(screen.queryByText("1 event found.")).not.toBeInTheDocument();
  unavailable = false;
  await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await waitFor(() => expect(screen.queryByText("History could not be loaded")).not.toBeInTheDocument());
  expect(screen.getByLabelText("From date")).toHaveValue("2026-10-01");
  expect(screen.getByText("Bearing inspected")).toBeVisible();
});

it("a machine search with no matches keeps its controls available and can be cleared", async () => {
  state.provider.listMachines.mockImplementation(async (query) => query?.search ? [] : testMachines);
  render(<MachinesPage />);
  expect(await screen.findByText("Machine A")).toBeVisible();
  await userEvent.type(screen.getByRole("textbox", { name: "Search machines" }), "missing pump");
  expect(await screen.findByText("No machines match your filters")).toBeVisible();
  expect(screen.queryByText("No machine access yet")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Search machines" })).toHaveValue("missing pump");
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(await screen.findByText("Machine A")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Search machines" })).toHaveValue("");
});

it("machine filters have accessible names and each table machine has a keyboard-accessible detail link", async () => {
  render(<MachinesPage />);
  expect(await screen.findByText("Machine A")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Line" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Status" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Sort by" })).toBeEnabled();
  const link = screen.getByRole("link", { name: "Machine A" });
  expect(link).toHaveAttribute("href", "/machines/machine-a");
  link.focus();
  expect(link).toHaveFocus();
});

it("filtering machines does not remove other production lines from the line selector", async () => {
  state.provider.listMachines.mockImplementation(async (query) => query?.search ? [testMachines[1]] : testMachines);
  render(<MachinesPage />);
  expect(await screen.findByText("Machine A")).toBeVisible();
  await userEvent.type(screen.getByRole("textbox", { name: "Search machines" }), "Machine B");
  await waitFor(() => expect(screen.queryByText("Machine A")).not.toBeInTheDocument());
  screen.getByRole("combobox", { name: "Line" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("option", { name: "Line 1" })).toBeVisible();
  expect(screen.getByRole("option", { name: "Line 3" })).toBeVisible();
});


it("history explains a reversed date range without requesting or presenting it as a valid result", async () => {
  render(<HistoryPage />);
  expect(await screen.findByText("Bearing inspected")).toBeVisible();
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-15" } });
  await waitFor(() => expect(screen.getByText("1 event found.")).toBeVisible());
  const requestCount = state.provider.listHistoryEvents.mock.calls.length;
  fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-01" } });
  expect(await screen.findByText("Choose an end date on or after the start date.")).toBeVisible();
  expect(screen.getByLabelText("To date")).toHaveAttribute("aria-invalid", "true");
  expect(state.provider.listHistoryEvents.mock.calls.length).toBe(requestCount);
  expect(screen.queryByText("1 event found.")).not.toBeInTheDocument();
});

it("machine refresh failures identify retained rows as previous results and retry the current search", async () => {
  let unavailable = false;
  state.provider.listMachines.mockImplementation(async () => {
    if (unavailable) throw new Error("unavailable");
    return [testMachines[0]];
  });
  render(<MachinesPage />);
  expect(await screen.findByText("Machine A")).toBeVisible();
  unavailable = true;
  fireEvent.change(screen.getByRole("textbox", { name: "Search machines" }), { target: { value: "Machine A" } });
  expect(await screen.findByText("Machines could not be loaded")).toBeVisible();
  expect(screen.getByText(/Showing previously loaded machines/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Machine A" })).toBeVisible();
  unavailable = false;
  await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await waitFor(() => expect(screen.queryByText("Machines could not be loaded")).not.toBeInTheDocument());
  expect(screen.getByRole("textbox", { name: "Search machines" })).toHaveValue("Machine A");
});

it("history distinguishes an empty audit log from filters that found no matches", async () => {
  state.provider.listHistoryEvents.mockResolvedValue([]);
  render(<HistoryPage />);
  expect(await screen.findByText("No activity recorded yet")).toBeVisible();
  fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-15" } });
  expect(await screen.findByText("No history records match the current filters.")).toBeVisible();
  expect(screen.getByText("Try a different date range, machine, or event type, or clear the filters.")).toBeVisible();
});
