import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { ConnectionDetailsSection } from "@/components/monitor/connection-details-section";
import {
  brokerPayload,
  draftFromConnection,
  formatSample,
  isConnectionDraftDirty,
} from "@/lib/domain/cmtk-connection";
import type { CmtkConnection, CmtkPreset, CmtkProbeResult } from "@/lib/domain/types";

const state = vi.hoisted(() => ({ provider: { probeCmtkBroker: vi.fn() } }));
vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => state.provider }));

const connection: CmtkConnection = {
  host: "cmtk-broker",
  port: 1883,
  tls: false,
  username: "User",
  hasPassword: true,
  topic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice",
  preset: "verbose",
  source: "saved",
};
const presets: Record<CmtkPreset, string> = {
  compact: "Compact CMTK JSON",
  verbose: "Verbose CMTK JSON",
  velocity: "CMTK device data (velocity, mm/s)",
  pd: "Balluff process data",
};
const okProbe: CmtkProbeResult = {
  connected: true,
  message: "Receiving data. The messages look like the 'compact' format.",
  topics: [
    { topic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice", messages: 5 },
    { topic: "balluff/cmtk/master1/iolink/devices/port2/data/fromdevice", messages: 2 },
  ],
  sample: { Slot1: 0.12, Slot4: 23.85, ts: "2026-10-06T03:48:53Z", mode: "low" },
  sampleTopic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice",
  detectedPreset: "compact",
  presetMatches: { compact: [], verbose: ["timestamp"], pd: ["Contact Temperature"] },
};

function Harness({ source = "saved" as CmtkConnection["source"], onDraft = (() => {}) as (draft: unknown) => void }) {
  const conn: CmtkConnection =
    source === "none"
      ? { host: null, port: 1883, tls: false, username: null, hasPassword: false, topic: null, preset: "compact", source }
      : { ...connection, source };
  const initial = draftFromConnection(conn);
  const [draft, setDraft] = useState(initial);
  onDraft(draft);
  return (
    <ConnectionDetailsSection
      idPrefix="t"
      connection={conn}
      presets={presets}
      draft={draft}
      initial={initial}
      onChange={setDraft}
      entityId="entity-machine-c"
      defaultOpen={source === "none"}
    />
  );
}

beforeEach(() => vi.clearAllMocks());

describe("cmtk-connection helpers", () => {
  it("sends the broker block only when something changed and the password only when typed", () => {
    const initial = draftFromConnection(connection);
    expect(isConnectionDraftDirty(initial, initial)).toBe(false);
    expect(brokerPayload(initial, initial)).toBeUndefined();
    expect(brokerPayload({ ...initial, port: "8883", tls: true }, initial)).toEqual({
      host: "cmtk-broker", port: 8883, tls: true, username: "User", topic: connection.topic, preset: "verbose",
    });
    expect(brokerPayload({ ...initial, password: "pw" }, initial)).toMatchObject({ password: "pw" });
    expect(brokerPayload({ ...initial, username: "" }, initial)).toMatchObject({ username: null });
    expect(draftFromConnection(null)).toMatchObject({ host: "", port: "1883", preset: "compact", password: "" });
    expect(formatSample("x".repeat(700)).endsWith("…")).toBe(true);
  });
});

describe("ConnectionDetailsSection", () => {
  it("tests with the saved connection, auto-selects the detected format, and lets the operator pick a topic", async () => {
    let latest: ReturnType<typeof draftFromConnection> | null = null;
    state.provider.probeCmtkBroker.mockResolvedValue(okProbe);
    render(<Harness onDraft={(draft) => { latest = draft as ReturnType<typeof draftFromConnection>; }} />);

    expect(screen.getByTestId("connection-details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));

    // Untouched section: no broker body, so the saved connection is probed.
    await waitFor(() => expect(state.provider.probeCmtkBroker).toHaveBeenCalledWith({ broker: undefined, entityId: "entity-machine-c", seconds: 8 }));
    const result = await screen.findByTestId("probe-result");
    expect(result).toHaveTextContent("Connected.");
    expect(result).toHaveTextContent("Receiving data. The messages look like the 'compact' format.");
    expect(result).toHaveTextContent("Format: Compact CMTK JSON");
    expect(screen.getByText("Detected from the live messages.")).toBeInTheDocument();
    expect(latest!.preset).toBe("compact");
    // Sample message is collapsed and compact.
    const sample = screen.getByText(/Sample message from/).closest("details");
    expect(sample).not.toHaveAttribute("open");
    expect(sample).toHaveTextContent('"Slot1": 0.12');

    await userEvent.click(within(result).getByRole("button", { name: /port2\/data\/fromdevice/ }));
    expect(latest!.topic).toBe("balluff/cmtk/master1/iolink/devices/port2/data/fromdevice");
    expect(screen.getByLabelText("Topic")).toHaveValue("balluff/cmtk/master1/iolink/devices/port2/data/fromdevice");
    expect(within(result).getByRole("button", { name: /port2\/data\/fromdevice/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports a refused connection with the server's operator-friendly message", async () => {
    state.provider.probeCmtkBroker.mockResolvedValue({
      ...okProbe, connected: false, message: "The broker refused the connection. Check the address and port.", topics: [], sample: null, sampleTopic: null, detectedPreset: null, presetMatches: {},
    });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    const result = await screen.findByTestId("probe-result");
    expect(result).toHaveTextContent("Not connected.");
    expect(result).toHaveTextContent("The broker refused the connection. Check the address and port.");
    expect(screen.queryByText(/Sample message/)).not.toBeInTheDocument();
    expect(screen.queryByText(/don't match a known CMTK format/)).not.toBeInTheDocument();
  });

  it("reports a connection with no messages yet", async () => {
    state.provider.probeCmtkBroker.mockResolvedValue({
      ...okProbe, connected: true, message: "Connected, but no messages arrived in 8 seconds. Is the machine on?", topics: [], sample: null, sampleTopic: null, detectedPreset: null, presetMatches: {},
    });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByTestId("probe-result")).toHaveTextContent("Connected, no messages yet. Connected, but no messages arrived in 8 seconds. Is the machine on?");
  });

  it("explains an unknown format per preset and points to the custom mapping", async () => {
    state.provider.probeCmtkBroker.mockResolvedValue({
      ...okProbe, message: "Receiving data, but the format is not recognised.", detectedPreset: null,
      presetMatches: { compact: ["Slot1", "Slot4"], verbose: ["timestamp"], pd: ["Contact Temperature"] },
    });
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    const result = await screen.findByTestId("probe-result");
    expect(result).toHaveTextContent("The messages don't match a known CMTK format.");
    expect(result).toHaveTextContent("Compact CMTK JSON: missing Slot1, Slot4.");
    expect(result).toHaveTextContent("Machine Registry → Add Machine Data → MQTT");
    // The chosen format is left alone when nothing was detected.
    expect(screen.getByLabelText("Payload format")).toHaveTextContent("Verbose CMTK JSON");
  });

  it("sends typed details when testing a changed connection and shows a notice when the test fails", async () => {
    state.provider.probeCmtkBroker.mockRejectedValue(new Error("boom"));
    render(<Harness source="none" />);
    expect(screen.getByTestId("connection-details")).toHaveAttribute("open");
    await userEvent.type(screen.getByLabelText("Broker address"), "10.0.0.5");
    await userEvent.type(screen.getByLabelText("Topic"), "#");
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(state.provider.probeCmtkBroker).toHaveBeenCalledWith(expect.objectContaining({ broker: expect.objectContaining({ host: "10.0.0.5", topic: "#" }) })));
    expect(await screen.findByText("The connection test could not run")).toBeVisible();
  });
});
