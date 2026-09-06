import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_SOURCE_BYTES,
  combineReceiptDescription,
  receiptImageDimensions,
  validateReceiptImageSource,
} from "../frontend/src/receiptImage";

describe("receipt image preparation helpers", () => {
  it("membatasi sisi terpanjang ke 1800 piksel tanpa memperbesar gambar", () => {
    expect(receiptImageDimensions(4000, 3000)).toEqual({
      width: 1800,
      height: 1350,
    });
    expect(receiptImageDimensions(900, 1200)).toEqual({
      width: 900,
      height: 1200,
    });
  });

  it("menolak sumber kosong, non-gambar, dan lebih dari 15 MiB", () => {
    expect(() =>
      validateReceiptImageSource({ size: 0, type: "image/jpeg" }),
    ).toThrow("kosong");
    expect(() =>
      validateReceiptImageSource({ size: 10, type: "application/pdf" }),
    ).toThrow("gambar");
    expect(() =>
      validateReceiptImageSource({
        size: MAX_RECEIPT_SOURCE_BYTES + 1,
        type: "image/jpeg",
      }),
    ).toThrow("15 MiB");
    expect(() =>
      validateReceiptImageSource({
        size: MAX_RECEIPT_SOURCE_BYTES,
        type: "image/jpeg",
      }),
    ).not.toThrow();
  });

  it("menggabungkan merchant dan deskripsi tanpa duplikasi dan maksimal 500", () => {
    expect(combineReceiptDescription(" Toko Maju ", "Belanja bulanan")).toBe(
      "Toko Maju - Belanja bulanan",
    );
    expect(combineReceiptDescription("Toko Maju", "toko maju")).toBe(
      "Toko Maju",
    );
    expect(combineReceiptDescription(null, " Catatan ")).toBe("Catatan");
    expect(combineReceiptDescription("A".repeat(600), null)).toHaveLength(500);
  });
});
