import { describe, expect, it } from "vitest";
import {
  buildExportPath,
  parseCsvSample,
  resolveExportOwner,
  suggestedMapping,
} from "../frontend/src/importExport";

describe("export presentation", () => {
  it("menyusun filter backend tanpa parameter kosong", () => {
    expect(
      buildExportPath("csv", "transactions", {
        owner: "user-1",
        from: "2026-01-01",
        to: "2026-01-31",
        includeDeleted: true,
      }),
    ).toBe(
      "/api/export/transactions.csv?owner=user-1&from=2026-01-01&to=2026-01-31&include_deleted=true",
    );
    expect(buildExportPath("xlsx", "categories", {})).toBe(
      "/api/export/all.xlsx",
    );
  });

  it("mengunci owner sendiri dalam Tampilan Saya", () => {
    expect(resolveExportOwner("solo", "user-1", "user-2")).toBe("user-1");
    expect(resolveExportOwner("couple", "user-1", "user-2")).toBe("user-2");
    expect(resolveExportOwner("couple", "user-1", "")).toBeUndefined();
  });
});

describe("CSV import preview", () => {
  it("membaca heading, jumlah baris, dan maksimal lima sampel", () => {
    const csv = [
      "type, name ,is_active",
      ...Array.from(
        { length: 7 },
        (_, index) => `expense,Kategori ${index + 1},true`,
      ),
    ].join("\n");
    const sample = parseCsvSample(csv);

    expect(sample.headers).toEqual(["type", "name", "is_active"]);
    expect(sample.totalRows).toBe(7);
    expect(sample.rows).toHaveLength(5);
    expect(suggestedMapping("categories", sample.headers)).toEqual({
      type: "type",
      name: "name",
      is_active: "is_active",
    });
  });

  it("menandai kolom canonical yang belum tersedia", () => {
    expect(suggestedMapping("categories", ["jenis", "nama"])).toEqual({
      type: "",
      name: "",
      is_active: "",
    });
  });

  it("menolak heading duplikat, file kosong, dan lebih dari 500 baris", () => {
    expect(() => parseCsvSample("type,type\nexpense,expense")).toThrow(
      "duplikat",
    );
    expect(() => parseCsvSample("type,name,is_active\n")).toThrow(
      "tidak memiliki baris data",
    );
    const rows = Array.from(
      { length: 501 },
      (_, index) => `expense,Kategori ${index},true`,
    ).join("\n");
    expect(() => parseCsvSample(`type,name,is_active\n${rows}`)).toThrow(
      "maksimal 500 baris",
    );
  });
});
