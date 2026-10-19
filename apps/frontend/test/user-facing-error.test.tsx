import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { ApiError } from "@/lib/data/fastapi-provider";
import { toUserFacingError } from "@/lib/errors/user-facing-error";

describe("toUserFacingError", () => {
  it.each([
    [401, "Invalid credentials", "Sign-in failed"],
    [429, "internal rate limit", "Too many sign-in attempts"],
    [503, "private upstream error", "Sign-in unavailable"],
    [403, "Administrator MFA setup is required.", "Authenticator setup required"],
    [403, "private unknown policy", "Sign-in failed"],
  ])("explains sign-in status %s without exposing internal details", (status, detail, title) => {
    const result = toUserFacingError(new ApiError({ status, detail, path: "/api/v1/auth/login" }), "auth.sign-in");
    expect(result.title).toBe(title);
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("does not blame the password when sign-in cannot reach the network", () => {
    expect(toUserFacingError(new TypeError("Failed to fetch"), "auth.sign-in").title).toBe("Sign-in unavailable");
  });
  it("turns an invalid MFA response into actionable copy without transport details", () => {
    const result = toUserFacingError(
      new ApiError({
        status: 401,
        path: "/api/v1/auth/mfa/verify",
        detail: "Invalid MFA code.",
        rawBody: '{"detail":"Invalid MFA code."}',
      }),
      "auth.verify-mfa",
    );

    expect(result).toEqual({
      title: "Invalid code",
      message:
        "Check the code in your authenticator app and try again, or use a backup code.",
    });
    expect(JSON.stringify(result)).not.toMatch(/FastAPI|\/api\/v1|401|\{"detail"/);
  });

  it.each([403, 404, 409, 413, 422, 429, 503])(
    "sanitises an HTTP %s failure",
    (status) => {
    const result = toUserFacingError(
      new ApiError({
        status,
        path: "/api/v1/internal",
        detail: "FastAPI internals exploded at /srv/app.py",
        rawBody: "private response",
      }),
      "data.load",
    );

    expect(result).toEqual({
      title: "Couldn’t load information",
      message: "Try again in a moment.",
    });
    expect(JSON.stringify(result)).not.toMatch(/FastAPI|\/api\/v1|\/srv|private response/);
    },
  );

  it("explains a network failure without repeating the exception", () => {
    const result = toUserFacingError(
      new TypeError("Failed to fetch http://backend:8000/api/v1/machines"),
      "data.load",
    );

    expect(result).toEqual({
      title: "Couldn’t load information",
      message: "Try again in a moment.",
    });
    expect(JSON.stringify(result)).not.toContain("backend:8000");
  });

  it("does not render an arbitrary background-job error", () => {
    const result = toUserFacingError(
      "Traceback: MLflow request failed (500) at /api/v1/training",
      "training.run",
    );

    expect(result).toEqual({
      title: "Training failed",
      message: "Check the machine data and training settings and try again.",
    });
    expect(JSON.stringify(result)).not.toMatch(/Traceback|MLflow|500|\/api\/v1/);
  });
});

describe("ErrorNotice", () => {
  it("renders accessible guidance and invokes its contextual action", async () => {
    const onAction = vi.fn();

    render(
      <ErrorNotice
        error={{
          title: "Couldn’t load machines",
          message: "Try loading the list again.",
        }}
        actionLabel="Try Again"
        onAction={onAction}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Try loading the list again.")).toBeInTheDocument();
    expect(screen.queryByText("What to do next:")).not.toBeInTheDocument();
    expect(screen.queryByText("Details:")).not.toBeInTheDocument();
    expect(alert).toHaveClass("text-xs");

    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
