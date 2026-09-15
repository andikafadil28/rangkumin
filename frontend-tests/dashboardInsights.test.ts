import { describe, expect, it } from "vitest";
import {
  changeDescription,
  percentageChange,
} from "../frontend/src/dashboardInsights";

describe("dashboard insights", () => {
  it("menghitung perubahan persentase naik dan turun", () => {
    expect(percentageChange(1_200_000, 1_000_000)).toBe(20);
    expect(percentageChange(750_000, 1_000_000)).toBe(-25);
  });

  it("tidak mengarang persentase ketika bulan lalu nol", () => {
    expect(percentageChange(500_000, 0)).toBeNull();
    expect(changeDescription("Pengeluaran", 500_000, 0)).toContain(
      "Belum ada pembanding",
    );
  });

  it("membuat narasi perubahan yang mudah dibaca", () => {
    expect(changeDescription("Pengeluaran", 800_000, 1_000_000)).toBe(
      "Pengeluaran turun 20% dari bulan lalu.",
    );
  });
});
