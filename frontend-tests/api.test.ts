import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthRequiredError,
  NetworkError,
  createTransaction,
  requestJson,
} from "../frontend/src/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("memakai credential same-origin dan melarang cache API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson<{ ok: boolean }>("/api/me")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });

  it("membedakan network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(requestJson("/api/me")).rejects.toBeInstanceOf(NetworkError);
  });

  it("mendeteksi redirect Cloudflare Access", async () => {
    const response = new Response("login", {
      headers: { "Content-Type": "text/html" },
    });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "https://access.example.invalid/login" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(requestJson("/api/me")).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });

  it("mengirim expected actor bersama idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transaction: {} }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createTransaction(
      {
        type: "expense",
        amount: 10_000,
        category_id: "category-expense-belanja",
        transaction_date: "2026-09-06",
      },
      "offline-request-0001",
      "user-1",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transactions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": "offline-request-0001",
          "X-Rangkumin-Actor-Id": "user-1",
        }),
      }),
    );
  });
});
