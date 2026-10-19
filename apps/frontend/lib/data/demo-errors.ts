/**
 * Thrown by the frontend-only demo provider for actions that need the real backend
 * (a live broker, a training worker, an email-free invitation flow, file storage).
 * The message is written for the reader of the demo, so the error mapper shows it as is.
 */
export class DemoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoUnavailableError";
  }
}

export const DEMO_UNAVAILABLE_TITLE = "Not available in the demo";
