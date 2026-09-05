export function getCurrentMonthRange(
  now = new Date(),
  timezone = "Asia/Jakarta",
): { from: string; to: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error("Gagal menentukan periode bulan berjalan.");
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthText = String(month).padStart(2, "0");

  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}
