import { expect, it } from "vitest";
import { ApiError } from "@/lib/data/fastapi-provider";
import { toUserFacingError } from "@/lib/errors/user-facing-error";

it.each([
  [400, "At least one active admin must remain in the system.", /last active administrator/i],
  [400, "At least one admin must remain in the system.", /last active administrator/i],
  [409, "The user must enable authenticator MFA before becoming an administrator.", /enable.*authenticator/i],
  [403, "A current administrator authenticator code is required.", /current code/i],
  [409, "An account already uses this username.", /different username/i],
  [422, "One or more selected machines do not exist.", /refresh.*machine/i],
])("explains a known account rejection (%s)", (status, detail, expected) => {
  const result = toUserFacingError(new ApiError({ status, path: "/api/v1/users/one/access", detail }), "data.save", { message: "Generic fallback" });
  expect(`${result.title} ${result.message}`).toMatch(expected);
  expect(result.message).not.toBe("Generic fallback");
});

it("never displays arbitrary diagnostics or treats unrelated failures as account errors", () => {
  for (const error of [
    new ApiError({ status: 500, path: "/api/v1/users/one/access", detail: "secret traceback" }),
    new ApiError({ status: 400, path: "/api/v1/machines/one", detail: "At least one admin must remain in the system." }),
  ]) {
    expect(toUserFacingError(error, "data.save")).toEqual({ title: "Changes not saved", message: "Check your changes and try again." });
  }
});
