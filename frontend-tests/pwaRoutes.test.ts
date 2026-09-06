import { describe, expect, it } from "vitest";
import { shouldHandleNavigation } from "../frontend/src/offline/pwaRoutes";

describe("service worker route policy", () => {
  it("hanya menangani navigasi app shell same-origin", () => {
    const origin = "https://rangkumin.example.invalid";

    expect(shouldHandleNavigation(`${origin}/`, origin, "navigate")).toBe(true);
    expect(
      shouldHandleNavigation(`${origin}/transactions`, origin, "navigate"),
    ).toBe(true);
    expect(
      shouldHandleNavigation(`${origin}/assets/app.js`, origin, "no-cors"),
    ).toBe(false);
  });

  it("tidak pernah menangani API atau Cloudflare Access", () => {
    const origin = "https://rangkumin.example.invalid";

    expect(
      shouldHandleNavigation(`${origin}/api/transactions`, origin, "navigate"),
    ).toBe(false);
    expect(shouldHandleNavigation(`${origin}/api`, origin, "navigate")).toBe(
      false,
    );
    expect(
      shouldHandleNavigation(
        `${origin}/cdn-cgi/access/login`,
        origin,
        "navigate",
      ),
    ).toBe(false);
    expect(
      shouldHandleNavigation(
        "https://access.example.invalid/login",
        origin,
        "navigate",
      ),
    ).toBe(false);
    expect(
      shouldHandleNavigation(`${origin}/cdn-cgi/access`, origin, "navigate"),
    ).toBe(false);
  });
});
