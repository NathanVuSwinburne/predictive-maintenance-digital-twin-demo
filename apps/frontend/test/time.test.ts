import { describe, expect, it } from "vitest";

import { formatDateTime, formatTimeWithSeconds } from "@/lib/domain/presentation";
import {
  APP_TIME_ZONE,
  appTimeZoneCaption,
  appTimeZoneLabel,
  formatAppAxisTime,
  formatAppDate,
  formatAppDateTime,
  formatAppNumericDateTime,
  formatAppTimeWithSeconds,
  formatInAppTimeZone,
} from "@/lib/time";

// The runner's own zone must not leak into the output: format as if on the UTC Docker
// server. The formatters pass an explicit zone, so this only proves they ignore TZ.
process.env.TZ = "UTC";

// 03:04:05 UTC is 14:04:05 AEDT (UTC+11) in January and 13:04:05 AEST (UTC+10) in July.
const SUMMER = "2026-01-15T03:04:05Z";
const WINTER = "2026-07-15T03:04:05Z";
// 14:30 UTC on 5 Oct is already 01:30 on 6 Oct in Melbourne (the date rolls over too).
const ACROSS_MIDNIGHT = "2026-10-05T14:30:00Z";

function normalise(text: string) {
  // ICU separates "pm" with a narrow no-break space on some Node versions.
  return text.replace(/[  ]/g, " ");
}

describe("app time zone", () => {
  it("defaults to Melbourne", () => {
    expect(APP_TIME_ZONE).toBe("Australia/Melbourne");
  });

  it("formats Melbourne daylight-saving time in summer", () => {
    expect(normalise(formatAppTimeWithSeconds(SUMMER))).toBe("02:04:05 pm");
    expect(normalise(formatAppDateTime(SUMMER))).toBe("15 Jan 2026, 2:04 pm");
    expect(normalise(formatAppAxisTime(SUMMER))).toBe("02:04 pm");
    expect(appTimeZoneLabel(SUMMER)).toBe("AEDT");
    expect(appTimeZoneCaption(SUMMER)).toBe("Times in Melbourne (AEDT)");
  });

  it("formats Melbourne standard time in winter", () => {
    expect(normalise(formatAppTimeWithSeconds(WINTER))).toBe("01:04:05 pm");
    expect(normalise(formatAppAxisTime(WINTER))).toBe("01:04 pm");
    expect(appTimeZoneLabel(WINTER)).toBe("AEST");
    expect(appTimeZoneCaption(WINTER)).toBe("Times in Melbourne (AEST)");
  });

  it("uses the Melbourne calendar date, not the UTC one", () => {
    expect(normalise(formatAppDate(ACROSS_MIDNIGHT))).toBe("6 Oct 2026");
    expect(normalise(formatAppNumericDateTime(ACROSS_MIDNIGHT))).toBe("06/10/2026, 1:30:00 am");
    expect(
      normalise(formatInAppTimeZone(new Date(ACROSS_MIDNIGHT), { day: "numeric", month: "short" })),
    ).toBe("6 Oct");
  });

  it("routes the shared presentation formatters through the app zone", () => {
    expect(normalise(formatTimeWithSeconds(SUMMER))).toBe("02:04:05 pm");
    expect(normalise(formatDateTime(WINTER))).toBe(normalise(formatAppDateTime(WINTER)));
  });

  it("returns unparseable input unchanged instead of throwing", () => {
    expect(formatAppDateTime("not a date")).toBe("not a date");
  });
});
