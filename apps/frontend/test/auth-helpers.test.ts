import { describe, expect, it } from "vitest";

import {
  applyAccessControlStateToUsers,
  normalizeAccessControlState,
  serializeAccessControlState,
  parseAccessControlState,
  userCanAccessMachine,
} from "@/lib/auth/access-control-state";
import {
  parseSessionMeta,
  serializeSessionMeta,
} from "@/lib/auth/session-cookie-state";
import { testSessions, testUsers } from "@/test/fixtures/domain";

describe("auth helper serialization", () => {
  it("round-trips session metadata without persisting the token", () => {
    const serialized = serializeSessionMeta(testSessions.user);
    const parsed = parseSessionMeta(serialized);

    expect(parsed).toEqual({
      token: "",
      userId: "user-002",
      activePersonaId: "user-002",
      authenticatedAt: "2026-05-30T00:00:00.000Z",
    });
    expect(serialized).not.toContain("token-user");
  });

  it("normalizes access-control state before using or serializing it", () => {
    const state = normalizeAccessControlState({
      rolesByUserId: {
        "user-001": "admin",
        "user-002": "user",
        "user-999": "owner" as "admin",
      },
      machineIdsByUserId: {
        "user-002": ["machine-c", "", "machine-a", "machine-c"],
      },
    });

    expect(state).toEqual({
      rolesByUserId: {
        "user-001": "admin",
        "user-002": "user",
      },
      machineIdsByUserId: {
        "user-002": ["machine-a", "machine-c"],
      },
    });
    expect(parseAccessControlState(serializeAccessControlState(state))).toEqual(
      state,
    );
  });

  it("applies role overrides and machine access checks", () => {
    const state = normalizeAccessControlState({
      rolesByUserId: {
        "user-002": "admin",
      },
      machineIdsByUserId: {
        "user-003": ["machine-b"],
      },
    });

    const users = applyAccessControlStateToUsers(testUsers, state);

    expect(users.find((user) => user.id === "user-002")?.role).toBe("admin");
    expect(userCanAccessMachine(users[1], state, "machine-c")).toBe(true);
    expect(userCanAccessMachine(users[2], state, "machine-b")).toBe(true);
    expect(userCanAccessMachine(users[2], state, "machine-c")).toBe(false);
  });
});
