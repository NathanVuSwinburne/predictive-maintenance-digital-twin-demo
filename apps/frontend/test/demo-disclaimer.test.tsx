import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoDisclaimer } from "@/components/demo/demo-disclaimer";

describe("DemoDisclaimer", () => {
  it("states simulation and dataset provenance clearly", () => {
    render(<DemoDisclaimer />);

    expect(screen.getByText(/all displayed live metrics are simulated/i)).toBeInTheDocument();
    expect(screen.getByText(/Machine A.*public AI4I dataset/i)).toBeInTheDocument();
    expect(screen.getByText(/Machine C.*synthetic\/sanitized data/i)).toBeInTheDocument();
  });
});
