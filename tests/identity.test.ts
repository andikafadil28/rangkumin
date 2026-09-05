import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src";
import { createIdentityMiddleware } from "../src/middleware/identity";
import type { AppBindings, AppEnv } from "../src/types";

type UserRow = {
  id: string;
  display_name: string;
};

function createEnvironment(
  user: UserRow | null,
  overrides: Partial<AppBindings> = {},
) {
  const first = vi.fn().mockResolvedValue(user);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  const environment = {
    APP_ENV: "development",
    DB: { prepare } as unknown as D1Database,
    ...overrides,
  } as AppBindings;

  return { bind, environment, prepare };
}

describe("identity middleware", () => {
  it("menolak request tanpa identity header", async () => {
    const { environment, prepare } = createEnvironment(null);

    const response = await app.request("/api/me", {}, environment);

    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  it("menolak identity yang tidak terdaftar di D1", async () => {
    const { bind, environment } = createEnvironment(null);

    const response = await app.request(
      "/api/me",
      {
        headers: {
          "Cf-Access-Authenticated-User-Email": "unknown@example.invalid",
        },
      },
      environment,
    );

    expect(response.status).toBe(403);
    expect(bind).toHaveBeenCalledWith("unknown@example.invalid");
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
    });
  });

  it("memetakan email tanpa membocorkannya ke response", async () => {
    const { bind, environment } = createEnvironment({
      id: "user-1",
      display_name: "User Satu",
    });

    const response = await app.request(
      "/api/me",
      {
        headers: {
          "Cf-Access-Authenticated-User-Email": "  USER1@example.invalid  ",
        },
      },
      environment,
    );

    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith("user1@example.invalid");
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        displayName: "User Satu",
      },
    });
  });

  it("mengembalikan 404 setelah identity valid untuk route tidak dikenal", async () => {
    const { environment } = createEnvironment({
      id: "user-1",
      display_name: "User Satu",
    });

    const response = await app.request(
      "/api/tidak-ada",
      {
        headers: {
          "Cf-Access-Authenticated-User-Email": "user1@example.invalid",
        },
      },
      environment,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not Found",
    });
  });

  it("menolak spoofed email header pada production tanpa JWT", async () => {
    const { environment, prepare } = createEnvironment(null, {
      ACCESS_AUD: "test-audience",
      ACCESS_TEAM_DOMAIN: "https://test.cloudflareaccess.com",
      APP_ENV: "production",
    });

    const response = await app.request(
      "/api/me",
      {
        headers: {
          "Cf-Access-Authenticated-User-Email": "user1@example.invalid",
        },
      },
      environment,
    );

    expect(response.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  it("memakai email dari JWT terverifikasi pada production", async () => {
    const { environment } = createEnvironment(
      { id: "user-1", display_name: "User Satu" },
      {
        ACCESS_AUD: "test-audience",
        ACCESS_TEAM_DOMAIN: "https://test.cloudflareaccess.com",
        APP_ENV: "production",
      },
    );
    const verifyToken = vi.fn().mockResolvedValue("user1@example.invalid");
    const productionApp = new Hono<AppEnv>();

    productionApp.use("*", createIdentityMiddleware(verifyToken));
    productionApp.get("/me", (context) =>
      context.json({ user: context.get("currentUser") }),
    );

    const response = await productionApp.request(
      "/me",
      {
        headers: {
          "Cf-Access-Jwt-Assertion": "signed-token",
          "Cf-Access-Authenticated-User-Email": "spoofed@example.invalid",
        },
      },
      environment,
    );

    expect(response.status).toBe(200);
    expect(verifyToken).toHaveBeenCalledWith(
      "signed-token",
      "https://test.cloudflareaccess.com",
      "test-audience",
    );
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-1", displayName: "User Satu" },
    });
  });
});
