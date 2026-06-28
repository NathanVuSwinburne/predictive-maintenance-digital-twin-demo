"use client";

import { getDataProvider } from "@/lib/data/provider-factory";

export function useDataProvider() {
  return getDataProvider();
}
