"use client";

import { MoonStarsIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Switch to ${isDark ? "light" : "dark"} monitoring mode`}
      title={`Switch to ${isDark ? "light" : "dark"} monitoring mode`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <SunIcon weight="duotone" /> : <MoonStarsIcon weight="duotone" />}
    </Button>
  );
}
