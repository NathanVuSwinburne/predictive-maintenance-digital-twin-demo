import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SaveToWikiButton } from "@/components/knowledge/save-to-wiki-button";

const provider = vi.hoisted(() => ({
  captureToKnowledge: vi.fn(),
}));

vi.mock("@/hooks/use-data-provider", () => ({
  useDataProvider: () => provider,
}));

describe("SaveToWikiButton", () => {
  beforeEach(() => {
    provider.captureToKnowledge.mockReset();
    provider.captureToKnowledge.mockResolvedValue({
      id: "fleet/machine-c-bearing-inspection",
      path: "fleet/machine-c-bearing-inspection.md",
    });
  });

  test("restores a message's saved state after the conversation is remounted", async () => {
    const firstRender = render(
      <SaveToWikiButton
        messageId="message-assistant-1"
        text="Inspect the Machine C bearing assembly."
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Save to Knowledge Base" }),
    );
    await userEvent.type(screen.getByLabelText("Title"), "Machine C bearing inspection");
    await userEvent.click(screen.getByRole("button", { name: "Save Insight" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(
      await screen.findByRole("link", { name: "Saved to Knowledge Base" }),
    ).toBeInTheDocument();

    firstRender.unmount();
    render(
      <SaveToWikiButton
        messageId="message-assistant-1"
        text="Inspect the Machine C bearing assembly."
      />,
    );

    expect(
      await screen.findByRole("link", { name: "Saved to Knowledge Base" }),
    ).toBeInTheDocument();
  });
});
