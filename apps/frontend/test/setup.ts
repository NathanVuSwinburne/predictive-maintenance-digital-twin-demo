import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

const navigationMock = vi.hoisted(() => ({
  pathname: "/dashboard",
  searchParams: new URLSearchParams(),
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMock.router,
  usePathname: () => navigationMock.pathname,
  useSearchParams: () => navigationMock.searchParams,
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

Object.assign(globalThis, {
  __nextNavigationMock: navigationMock,
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

if (!document.elementFromPoint) {
  document.elementFromPoint = () => document.body;
}

afterEach(() => {
  navigationMock.pathname = "/dashboard";
  navigationMock.searchParams = new URLSearchParams();
  navigationMock.router.push.mockReset();
  navigationMock.router.replace.mockReset();
  navigationMock.router.refresh.mockReset();
  navigationMock.router.back.mockReset();
  navigationMock.router.forward.mockReset();
  navigationMock.router.prefetch.mockReset();
  localStorage.clear();
  document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0]?.trim())
    .filter(Boolean)
    .forEach((name) => {
      document.cookie = `${name}=; path=/; max-age=0`;
    });
});

declare global {
  var __nextNavigationMock: typeof navigationMock;
}
