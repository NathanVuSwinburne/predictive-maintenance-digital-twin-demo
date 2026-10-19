import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MonitorLanding, autoRedirectTarget } from "@/components/monitor/monitor-landing";
import type { CmtkMachine, CmtkSetup } from "@/lib/domain/types";

const state = vi.hoisted(() => ({
  provider: { getCmtkSetup: vi.fn(), connectCmtkMachine: vi.fn(), probeCmtkBroker: vi.fn() },
  replace: vi.fn(),
  push: vi.fn(),
  search: "",
}));

vi.mock("@/hooks/use-data-provider", () => ({ useDataProvider: () => state.provider }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: state.push }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), message: vi.fn() } }));

const machine: CmtkMachine = {
  entityId: "entity-machine-c",
  name: "CMTK Demo Rig",
  description: "Lab 2",
  sourceId: "source-cmtk-1",
  state: "live",
  lastMessageAt: "2026-10-06T10:00:08.000Z",
  lastError: null,
};

const configured: CmtkSetup = {
  configured: true,
  broker: "cmtk-broker:1883",
  topic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice",
  preset: "compact",
  presetDescription: "Compact CMTK JSON",
  canConnect: true,
  defaultEntityId: "entity-machine-c",
  machines: [],
  candidates: [
    { entityId: "entity-machine-b", name: "Sensor Data Machine", compatible: false, missingFeatures: ["Temperature"] },
    { entityId: "entity-machine-c", name: "Vibration Sensor Machine", compatible: true, missingFeatures: [] },
  ],
  connection: {
    host: "cmtk-broker",
    port: 1883,
    tls: false,
    username: "User",
    hasPassword: true,
    topic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice",
    preset: "compact",
    source: "server",
  },
  presets: {
    compact: "Compact CMTK JSON: Slot1-3 vibration X/Y/Z, Slot4 temperature, ts, mode.",
    verbose: "Verbose CMTK JSON: data.items acceleration RMS and contact temperature.",
    velocity: "Balluff CMTK device data: data.items velocity RMS v-RMS X/Y/Z (mm/s) and contact temperature.",
    pd: "Balluff process data: velocity RMS X/Y/Z and contact temperature.",
  },
};

const notConfigured: CmtkSetup = {
  ...configured,
  configured: false,
  broker: null,
  topic: null,
  connection: { host: null, port: 1883, tls: false, username: null, hasPassword: false, topic: null, preset: "compact", source: "none" },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.search = "";
});

describe("MonitorLanding", () => {
  it("is not a dead end when the server is not set up: the form shows with connection details expanded", async () => {
    state.provider.getCmtkSetup.mockResolvedValue(notConfigured);
    render(<MonitorLanding />);

    expect(await screen.findByText(/isn't set up to listen to the CMTK yet/)).toBeVisible();
    const operatorNote = screen.getByText(/For the operator/).closest("details");
    expect(operatorNote).not.toHaveAttribute("open");
    expect(screen.getByText("CMTK_MQTT_HOST")).toBeInTheDocument();
    expect(screen.getByText("CMTK_MQTT_TOPIC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start monitoring" })).toBeInTheDocument();
    expect(screen.getByTestId("connection-details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Broker address")).toHaveValue("");
    expect(screen.getByLabelText("Password")).not.toHaveAttribute("placeholder");
  });

  it("requires connection details before connecting when nothing is configured", async () => {
    state.provider.getCmtkSetup.mockResolvedValue(notConfigured);
    render(<MonitorLanding />);

    await userEvent.click(await screen.findByRole("button", { name: "Start monitoring" }));
    expect(await screen.findByText("Check the connection details")).toBeVisible();
    expect(state.provider.connectCmtkMachine).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Broker address"), "192.168.1.20");
    await userEvent.type(screen.getByLabelText("Topic"), "balluff/#");
    state.provider.connectCmtkMachine.mockResolvedValue({ machine, connection: { success: true, message: "ok" } });
    await userEvent.click(screen.getByRole("button", { name: "Start monitoring" }));
    await waitFor(() =>
      expect(state.provider.connectCmtkMachine).toHaveBeenCalledWith(
        expect.objectContaining({
          broker: { host: "192.168.1.20", port: 1883, tls: false, username: null, topic: "balluff/#", preset: "compact" },
        }),
      ),
    );
  });

  it("omits broker details when the connection section is untouched, and the password when blank", async () => {
    state.provider.getCmtkSetup.mockResolvedValue(configured);
    state.provider.connectCmtkMachine.mockResolvedValue({ machine, connection: { success: true, message: "ok" } });
    render(<MonitorLanding />);

    // Prefilled from the server, collapsed, with the saved password never shown.
    expect(await screen.findByLabelText("Broker address")).toHaveValue("cmtk-broker");
    expect(screen.getByTestId("connection-details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Password")).toHaveAttribute("placeholder", "Saved — leave blank to keep");
    expect(screen.getByLabelText("Password")).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Start monitoring" }));
    await waitFor(() => expect(state.provider.connectCmtkMachine).toHaveBeenCalledTimes(1));
    expect(state.provider.connectCmtkMachine.mock.calls[0][0]).not.toHaveProperty("broker");

    // Changing the host sends the broker block without a password.
    await userEvent.clear(screen.getByLabelText("Broker address"));
    await userEvent.type(screen.getByLabelText("Broker address"), "10.0.0.5");
    await userEvent.click(screen.getByRole("button", { name: "Start monitoring" }));
    await waitFor(() => expect(state.provider.connectCmtkMachine).toHaveBeenCalledTimes(2));
    expect(state.provider.connectCmtkMachine.mock.calls[1][0].broker).toEqual({
      host: "10.0.0.5",
      port: 1883,
      tls: false,
      username: "User",
      topic: "balluff/cmtk/master1/iolink/devices/port1/data/fromdevice",
      preset: "compact",
    });

    // A typed password is sent.
    await userEvent.type(screen.getByLabelText("Password"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Start monitoring" }));
    await waitFor(() => expect(state.provider.connectCmtkMachine).toHaveBeenCalledTimes(3));
    expect(state.provider.connectCmtkMachine.mock.calls[2][0].broker.password).toBe("secret");
  });

  it("shows the guided connect form with the default machine prefilled and no model selector for one candidate", async () => {
    state.provider.getCmtkSetup.mockResolvedValue(configured);
    state.provider.connectCmtkMachine.mockResolvedValue({ machine, connection: { success: true, message: "Connected." } });
    render(<MonitorLanding />);

    const name = await screen.findByLabelText("Machine name");
    expect(name).toHaveValue("Vibration Sensor Machine");
    expect(screen.queryByLabelText("Model to use")).not.toBeInTheDocument();
    // Broker/topic are tucked into the collapsed connection section.
    expect(screen.getByTestId("connection-details")).not.toHaveAttribute("open");

    await userEvent.clear(name);
    await userEvent.type(name, "CMTK Demo Rig");
    await userEvent.type(screen.getByLabelText(/Description or location/), "Lab 2");
    await userEvent.click(screen.getByRole("button", { name: "Start monitoring" }));

    await waitFor(() =>
      expect(state.provider.connectCmtkMachine).toHaveBeenCalledWith({
        entityId: "entity-machine-c",
        machineName: "CMTK Demo Rig",
        description: "Lab 2",
      }),
    );
    expect(state.push).toHaveBeenCalledWith("/monitor/entity-machine-c");
  });

  it("still opens the monitor when the broker is not reachable yet", async () => {
    const { toast } = await import("sonner");
    state.provider.getCmtkSetup.mockResolvedValue(configured);
    state.provider.connectCmtkMachine.mockResolvedValue({
      machine: { ...machine, state: "disconnected", lastError: "ECONNREFUSED" },
      connection: { success: false, message: "Broker unreachable" },
    });
    render(<MonitorLanding />);

    await userEvent.click(await screen.findByRole("button", { name: "Start monitoring" }));

    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/monitor/entity-machine-c"));
    expect(toast.message).toHaveBeenCalledWith(
      "CMTK Demo Rig is set up",
      { description: "The CMTK isn't reachable yet — we'll keep trying." },
    );
    expect(screen.queryByText(/ECONNREFUSED|Broker unreachable/)).not.toBeInTheDocument();
  });

  it("keeps the form and shows a notice when the server rejects the machine", async () => {
    state.provider.getCmtkSetup.mockResolvedValue(configured);
    state.provider.connectCmtkMachine.mockRejectedValue(new Error("409"));
    render(<MonitorLanding />);

    await userEvent.click(await screen.findByRole("button", { name: "Start monitoring" }));

    expect(await screen.findByText("The machine could not be connected")).toBeVisible();
    expect(screen.getByLabelText("Machine name")).toHaveValue("Vibration Sensor Machine");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("offers a model selector when several candidates are compatible", async () => {
    state.provider.getCmtkSetup.mockResolvedValue({
      ...configured,
      candidates: configured.candidates.map((candidate) => ({ ...candidate, compatible: true, missingFeatures: [] })),
    });
    render(<MonitorLanding />);
    expect(await screen.findByLabelText("Model to use")).toBeInTheDocument();
    expect(screen.getByLabelText("Machine name")).toHaveValue("Vibration Sensor Machine");
  });

  it("goes straight to the only connected machine", async () => {
    state.provider.getCmtkSetup.mockResolvedValue({ ...configured, machines: [machine] });
    render(<MonitorLanding />);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/monitor/entity-machine-c"));
    expect(screen.queryByRole("button", { name: "Start monitoring" })).not.toBeInTheDocument();
  });

  it("shows a chooser for several machines and when switching is requested", async () => {
    const second: CmtkMachine = { ...machine, entityId: "entity-machine-d", name: "Press 4", description: "", state: "stale", lastMessageAt: null };
    state.provider.getCmtkSetup.mockResolvedValue({ ...configured, machines: [machine, second] });
    render(<MonitorLanding />);

    expect(await screen.findByText("Choose a machine to monitor")).toBeVisible();
    expect(screen.getByRole("link", { name: /CMTK Demo Rig/ })).toHaveAttribute("href", "/monitor/entity-machine-c");
    expect(screen.getByRole("link", { name: /Press 4/ })).toHaveAttribute("href", "/monitor/entity-machine-d");
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(state.replace).not.toHaveBeenCalled();

    expect(autoRedirectTarget({ ...configured, machines: [machine] }, true)).toBeNull();
    expect(autoRedirectTarget({ ...configured, machines: [machine] }, false)).toBe("/monitor/entity-machine-c");
    expect(autoRedirectTarget({ ...configured, machines: [machine, second] }, false)).toBeNull();
  });

  it("shows a retryable notice when the setup cannot be loaded", async () => {
    state.provider.getCmtkSetup.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(configured);
    render(<MonitorLanding />);

    expect(await screen.findByText("Live monitor could not be loaded")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Start monitoring" })).toBeVisible();
  });
});
