import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthRequiredError,
  NetworkError,
  commitImportFile,
  createWalletAllocation,
  createWallet,
  createTransaction,
  downloadFile,
  getTransactions,
  getWalletAllocations,
  getWallets,
  previewImport,
  requestJson,
  safeDownloadFilename,
  transferBetweenWallets,
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

  it("mengirim filter transaksi lanjutan sebagai query terenkode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ items: [], total: 0, limit: 10, offset: 0 }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getTransactions({
      owner: "user-1",
      wallet: "wallet-1",
      from: "2026-09-01",
      to: "2026-09-30",
      search: "belanja mingguan",
      minAmount: 10_000,
      maxAmount: 500_000,
      sort: "amount_desc",
      offset: 0,
    });

    const requested = new URL(
      String(fetchMock.mock.calls[0]![0]),
      "https://rangkumin.invalid",
    );
    expect(Object.fromEntries(requested.searchParams)).toMatchObject({
      owner: "user-1",
      wallet: "wallet-1",
      from: "2026-09-01",
      to: "2026-09-30",
      search: "belanja mingguan",
      min_amount: "10000",
      max_amount: "500000",
      sort: "amount_desc",
    });
  });

  it("mengirim kontrak CRUD dan transfer wallet ke endpoint yang tepat", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ wallets: [], wallet: {}, transfer: {} }),
            { headers: { "Content-Type": "application/json" } },
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await getWallets({ owner: "user-1", includeArchived: true });
    await createWallet({
      type: "bank",
      name: "Rekening Utama",
      initial_balance: 500_000,
    });
    await transferBetweenWallets(
      {
        source_wallet_id: "wallet-1",
        destination_wallet_id: "wallet-2",
        amount: 100_000,
        transaction_date: "2026-09-17",
      },
      "wallet-transfer-0001",
    );
    await createWalletAllocation({
      wallet_id: "wallet-1",
      direction: "to_wallet",
      amount: 25_000,
      description: "Saldo tunai lama",
    });
    await getWalletAllocations("wallet-1");

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/wallets?owner=user-1&archived=true",
    );
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/wallets");
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/wallets/transfer");
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Idempotency-Key": "wallet-transfer-0001",
      }),
    });
    expect(fetchMock.mock.calls[3]![0]).toBe("/api/wallets/allocations");
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1]?.body))).toEqual({
      wallet_id: "wallet-1",
      direction: "to_wallet",
      amount: 25_000,
      description: "Saldo tunai lama",
    });
    expect(fetchMock.mock.calls[4]![0]).toBe(
      "/api/wallets/wallet-1/allocations",
    );
  });
});

describe("import/export transport", () => {
  it("membersihkan nama file dari Content-Disposition", () => {
    expect(
      safeDownloadFilename(
        'attachment; filename="../../laporan rangkumin.csv"',
        "fallback.csv",
      ),
    ).toBe("laporan-rangkumin.csv");
    expect(safeDownloadFilename(null, "fallback.csv")).toBe("fallback.csv");
  });

  it("mengunduh tanpa cache, redirect otomatis, atau credential lintas origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("type,name\nexpense,Makan", {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition":
            'attachment; filename="rangkumin-categories.csv"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadFile(
      "/api/export/categories.csv",
      "fallback.csv",
    );

    expect(result.filename).toBe("rangkumin-categories.csv");
    expect(await result.blob.text()).toContain("expense,Makan");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/export/categories.csv",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
        redirect: "manual",
      }),
    );
  });

  it("membedakan network failure dan redirect Access saat download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(
      downloadFile("/api/export/all.xlsx", "rangkumin-export.xlsx"),
    ).rejects.toBeInstanceOf(NetworkError);

    const response = new Response("login");
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "https://access.example.invalid/login" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      downloadFile("/api/export/all.xlsx", "rangkumin-export.xlsx"),
    ).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("memakai file dan key yang sama untuk preview lalu commit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: "job-1",
            domain: "categories",
            status: "previewed",
            total_rows: 1,
            accepted_rows: 1,
            duplicate_rows: 0,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: "job-1",
            status: "committed",
            imported_rows: 1,
            duplicate_rows: 0,
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(
      ["type,name,is_active\nexpense,Makan,true"],
      "data.csv",
    );
    const key = "web:request-0001";

    await previewImport(
      file,
      "categories",
      { type: "type", name: "name", is_active: "is_active" },
      "reject",
      key,
    );
    await commitImportFile(file, "job-1", key);

    const previewOptions = fetchMock.mock.calls[0]![1] as RequestInit;
    const commitOptions = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(previewOptions.headers).toMatchObject({
      "X-Rangkumin-Import": key,
    });
    expect(commitOptions.headers).toMatchObject({
      "X-Rangkumin-Import": key,
    });
    expect((previewOptions.body as FormData).get("file")).toBe(file);
    expect((commitOptions.body as FormData).get("file")).toBe(file);
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/import/job-1/commit");
  });
});
