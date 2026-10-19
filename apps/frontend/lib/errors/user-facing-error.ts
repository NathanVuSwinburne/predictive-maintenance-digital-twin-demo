import { DEMO_UNAVAILABLE_TITLE, DemoUnavailableError } from "@/lib/data/demo-errors";
import { ApiError } from "@/lib/data/fastapi-provider";

export type UserFacingError = {
  title: string;
  message: string;
};

export type ErrorOperation =
  | "auth.sign-in"
  | "auth.verify-mfa"
  | "auth.security"
  | "auth.logout"
  | "data.load"
  | "data.refresh"
  | "data.save"
  | "data.create"
  | "data.delete"
  | "data.upload"
  | "chat.load"
  | "chat.send"
  | "simulation.run"
  | "training.run"
  | "clipboard.copy"
  | "runtime.page";

const operationCopy: Record<ErrorOperation, UserFacingError> = {
  "auth.sign-in": {
    title: "Sign-in failed",
    message: "Check your username and password and try again.",
  },
  "auth.verify-mfa": {
    title: "Invalid code",
    message: "Check the code in your authenticator app and try again, or use a backup code.",
  },
  "auth.security": {
    title: "Security settings not updated",
    message: "Check your details and try again.",
  },
  "auth.logout": {
    title: "Couldn’t sign out",
    message: "Try again. Close the browser if you’re using a shared device.",
  },
  "data.load": {
    title: "Couldn’t load information",
    message: "Try again in a moment.",
  },
  "data.refresh": {
    title: "Couldn’t refresh information",
    message: "The last available information is still shown. We’ll try again automatically.",
  },
  "data.save": {
    title: "Changes not saved",
    message: "Check your changes and try again.",
  },
  "data.create": {
    title: "Couldn’t create this item",
    message: "Check the information and try again.",
  },
  "data.delete": {
    title: "Couldn’t remove this item",
    message: "It is still available. Check that it isn’t in use and try again.",
  },
  "data.upload": {
    title: "Upload failed",
    message: "Check the file type and size and try again.",
  },
  "chat.load": {
    title: "Couldn’t load this conversation",
    message: "Try again in a moment.",
  },
  "chat.send": {
    title: "Message not sent",
    message: "Your message is still here. Try sending it again.",
  },
  "simulation.run": {
    title: "Simulation failed",
    message: "Check the machine data and settings and try again.",
  },
  "training.run": {
    title: "Training failed",
    message: "Check the machine data and training settings and try again.",
  },
  "clipboard.copy": {
    title: "Couldn’t copy the text",
    message: "Select and copy it manually.",
  },
  "runtime.page": {
    title: "Couldn’t open this page",
    message: "Try loading the page again.",
  },
};

export function toUserFacingError(
  cause: unknown,
  operation: ErrorOperation,
  overrides: Partial<UserFacingError> = {},
): UserFacingError {
  // The portfolio demo has no backend; its provider says so in a sentence written for the reader.
  if (cause instanceof DemoUnavailableError) {
    return { title: DEMO_UNAVAILABLE_TITLE, message: cause.message };
  }
  if (operation === "auth.sign-in" && cause instanceof TypeError) {
    return { title: "Sign-in unavailable", message: "Check your connection and try again in a moment." };
  }
  if (operation === "auth.sign-in" && cause instanceof ApiError) {
    if (cause.status === 429) return { title: "Too many sign-in attempts", message: "Wait before trying to sign in again." };
    if (cause.status >= 500 || cause.status === 0) return { title: "Sign-in unavailable", message: "The sign-in service cannot be reached right now. Try again in a moment." };
    if (cause.status === 403 && cause.detail === "Administrator MFA setup is required.") {
      return { title: "Authenticator setup required", message: "Contact an administrator to complete your account setup before signing in." };
    }
  }
  // Only translate known account-policy rejections. Never render raw details.
  if (cause instanceof ApiError && cause.path.startsWith("/api/v1/users/") && cause.status >= 400 && cause.status < 500) {
    const detail = typeof cause.detail === "string" ? cause.detail :
      cause.detail && typeof cause.detail === "object" && "code" in cause.detail ? String(cause.detail.code) : "";
    const known: Record<string, UserFacingError> = {
      "At least one active admin must remain in the system.": { title: "Last active administrator must stay active", message: "Add or promote another active administrator before suspending or deactivating this account." },
      "At least one admin must remain in the system.": { title: "Last active administrator cannot be demoted", message: "Add or promote another active administrator before changing this account’s role." },
      "The user must enable authenticator MFA before becoming an administrator.": { title: "User needs authenticator setup", message: "Ask this user to enable their authenticator in Account Security before promoting them." },
      "A current administrator authenticator code is required.": { title: "Administrator code not accepted", message: "Enter the current code from your own authenticator app and try again." },
      "An account already uses this username.": { title: "Username already in use", message: "Choose a different username or manage the existing account." },
      "Enter a valid email-form username.": { title: "Username format not accepted", message: "Enter a username in email format, such as operator@example.com; no email is sent." },
      "One or more selected machines do not exist.": { title: "Selected machine no longer available", message: "Refresh the machine list and review the selected machines before saving." },
      UNKNOWN_ENTITY_IDS: { title: "Selected machine no longer available", message: "Refresh the machine list and review the selected machines before saving." },
      "This invitation has already been accepted.": { title: "Account already activated", message: "Refresh the activation links and manage the existing account instead." },
      "This invitation has been revoked.": { title: "Activation link already revoked", message: "Refresh the activation links to see the current status." },
    };
    if (known[detail]) return known[detail];
    if (cause.status === 401) return { title: "Sign-in expired", message: "Sign in again before managing users." };
    if (cause.status === 404) return { title: "Account or activation link no longer available", message: "Refresh user management before trying again." };
  }
  return {
    ...operationCopy[operation],
    ...overrides,
  };
}

export function userFacingJobError(
  cause: unknown,
  operation: Extract<ErrorOperation, "training.run" | "simulation.run" | "data.upload">,
): UserFacingError {
  return toUserFacingError(cause, operation);
}
