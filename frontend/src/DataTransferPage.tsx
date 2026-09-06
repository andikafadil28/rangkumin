import { useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import {
  ApiError,
  commitImportFile,
  downloadFile,
  previewImport,
  type ImportIssue,
  type ImportPreview,
  type ImportResult,
} from "./api";
import {
  buildExportPath,
  canonicalColumns,
  domainLabels,
  MAX_TRANSFER_ROWS,
  parseCsvSample,
  resolveExportOwner,
  suggestedMapping,
  transferDomains,
  type FileSample,
  type TransferDomain,
} from "./importExport";
import type { ViewMode } from "./viewMode";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function errorMessage(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Permintaan belum dapat diproses.";
}

function importIssues(cause: unknown) {
  if (!(cause instanceof ApiError) || !cause.details) return [];
  const details = cause.details as { issues?: unknown };
  if (!Array.isArray(details.issues)) return [];
  return details.issues.filter(
    (issue): issue is ImportIssue =>
      typeof issue === "object" &&
      issue !== null &&
      typeof (issue as ImportIssue).row === "number" &&
      typeof (issue as ImportIssue).field === "string" &&
      typeof (issue as ImportIssue).message === "string",
  );
}

async function inspectFile(file: File, domain: TransferDomain) {
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Ukuran file maksimal 2 MiB.");
  if (file.name.toLowerCase().endsWith(".csv"))
    return parseCsvSample(await file.text());

  const sheets = await readXlsxFile(file);
  const selected =
    sheets.find((sheet) => sheet.sheet === domain) ??
    (sheets.length === 1 ? sheets[0] : undefined);
  if (!selected)
    throw new Error(`Sheet ${domain} tidak ditemukan di workbook.`);
  const rows = selected.data;
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
  if (!headers.length || headers.some((header) => !header))
    throw new Error("XLSX wajib memiliki heading yang tidak kosong.");
  if (new Set(headers).size !== headers.length)
    throw new Error("Heading XLSX tidak boleh duplikat.");
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((value) => value !== null && value !== ""));
  if (!dataRows.length) throw new Error("File tidak memiliki baris data.");
  if (dataRows.length > MAX_TRANSFER_ROWS)
    throw new Error("Import dibatasi maksimal 500 baris.");
  return {
    headers,
    rows: dataRows
      .slice(0, 5)
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [
            header,
            row[index] == null ? "" : String(row[index]),
          ]),
        ),
      ),
    totalRows: dataRows.length,
  } satisfies FileSample;
}

function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function DataTransferPage({
  userId,
  partnerId,
  viewMode,
  online,
  onBack,
}: {
  userId: string;
  partnerId?: string;
  viewMode: ViewMode;
  online: boolean;
  onBack: () => void;
}) {
  const [exportDomain, setExportDomain] =
    useState<TransferDomain>("transactions");
  const [owner, setOwner] = useState(viewMode === "solo" ? userId : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [domain, setDomain] = useState<TransferDomain>("transactions");
  const [file, setFile] = useState<File | null>(null);
  const [sample, setSample] = useState<FileSample | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState<"skip" | "reject">("reject");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"inspect" | "preview" | "commit" | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);

  const effectiveOwner = resolveExportOwner(viewMode, userId, owner);
  const mappingComplete = canonicalColumns[domain].every(
    (column) => mapping[column],
  );

  function invalidatePreview() {
    setPreview(null);
    setConfirmed(false);
    setRequestKey(null);
    setIssues([]);
    setImportError(null);
  }

  async function selectFile(next: File | null, nextDomain = domain) {
    invalidatePreview();
    setFile(next);
    setSample(null);
    setMapping({});
    if (!next) return;
    if (!/\.(csv|xlsx)$/i.test(next.name)) {
      setImportError("Pilih file dengan ekstensi .csv atau .xlsx.");
      return;
    }
    setBusy("inspect");
    try {
      const inspected = await inspectFile(next, nextDomain);
      setSample(inspected);
      setMapping(suggestedMapping(nextDomain, inspected.headers));
    } catch (cause) {
      setImportError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function changeDomain(next: TransferDomain) {
    setDomain(next);
    if (file) await selectFile(file, next);
    else invalidatePreview();
  }

  async function runExport(format: "csv" | "xlsx") {
    setExporting(format);
    setExportError(null);
    try {
      const path = buildExportPath(format, exportDomain, {
        owner: effectiveOwner,
        from: from || undefined,
        to: to || undefined,
        includeDeleted,
      });
      const fallback =
        format === "xlsx"
          ? "rangkumin-export.xlsx"
          : `rangkumin-${exportDomain}.csv`;
      const download = await downloadFile(path, fallback);
      saveFile(download.blob, download.filename);
    } catch (cause) {
      setExportError(errorMessage(cause));
    } finally {
      setExporting(null);
    }
  }

  async function runPreview() {
    if (!file || !mappingComplete) return;
    setBusy("preview");
    setImportError(null);
    setIssues([]);
    const key = requestKey ?? `web:${crypto.randomUUID()}`;
    setRequestKey(key);
    try {
      setPreview(await previewImport(file, domain, mapping, policy, key));
    } catch (cause) {
      setIssues(importIssues(cause));
      setImportError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  async function runCommit() {
    if (!file || !preview || !requestKey || !confirmed) return;
    setBusy("commit");
    setImportError(null);
    try {
      setResult(await commitImportFile(file, preview.job_id, requestKey));
      setPreview(null);
    } catch (cause) {
      setImportError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function resetImport() {
    setFile(null);
    setSample(null);
    setMapping({});
    setPreview(null);
    setResult(null);
    setIssues([]);
    setImportError(null);
    setConfirmed(false);
    setRequestKey(null);
  }

  return (
    <section className="data-transfer-page" aria-labelledby="transfer-title">
      <div className="page-heading transfer-heading">
        <div>
          <p className="eyebrow">Pengaturan · Data</p>
          <h1 id="transfer-title">Import & export</h1>
          <p>Pindahkan data dengan format terbuka, tetap dalam kendalimu.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>
          Kembali ke pengaturan
        </button>
      </div>

      {!online && (
        <div className="transfer-offline" role="status">
          <b>Perlu koneksi internet</b>
          <span>Import dan export tidak tersedia dari snapshot offline.</span>
        </div>
      )}

      <div className="transfer-layout">
        <section className="transfer-panel" aria-labelledby="export-title">
          <div className="transfer-panel-head">
            <span aria-hidden="true">EX</span>
            <div>
              <p className="eyebrow">Salinan data</p>
              <h2 id="export-title">Export</h2>
              <p>CSV per domain atau satu workbook XLSX lengkap.</p>
            </div>
          </div>
          <div className="transfer-fields">
            <label>
              <span>Domain untuk CSV</span>
              <select
                value={exportDomain}
                onChange={(event) =>
                  setExportDomain(event.target.value as TransferDomain)
                }
              >
                {transferDomains.map((item) => (
                  <option key={item} value={item}>
                    {domainLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Pemilik</span>
              <select
                value={effectiveOwner ?? ""}
                disabled={viewMode === "solo"}
                onChange={(event) => setOwner(event.target.value)}
              >
                {viewMode === "couple" && <option value="">Semua data</option>}
                <option value={userId}>Milik saya</option>
                {viewMode === "couple" && partnerId && (
                  <option value={partnerId}>Milik pasangan</option>
                )}
              </select>
              {viewMode === "solo" && (
                <small>Dikunci ke milikmu oleh Tampilan Saya.</small>
              )}
            </label>
            <label>
              <span>Dari tanggal</span>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              <span>Sampai tanggal</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
          <label className="transfer-check">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) => setIncludeDeleted(event.target.checked)}
            />
            <span>Sertakan transaksi di Trash</span>
          </label>
          <p className="transfer-hint">
            Filter periode berlaku untuk transaksi dan mutasi tabungan.
          </p>
          {exportError && (
            <p className="form-error" role="alert">
              {exportError}
            </p>
          )}
          <div className="transfer-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={
                !online ||
                exporting !== null ||
                Boolean(from && to && from > to)
              }
              onClick={() => void runExport("csv")}
            >
              {exporting === "csv" ? "Menyiapkan..." : "Download CSV"}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={
                !online ||
                exporting !== null ||
                Boolean(from && to && from > to)
              }
              onClick={() => void runExport("xlsx")}
            >
              {exporting === "xlsx" ? "Menyiapkan..." : "Download XLSX lengkap"}
            </button>
          </div>
        </section>

        <section
          className="transfer-panel import-panel"
          aria-labelledby="import-title"
        >
          <div className="transfer-panel-head">
            <span aria-hidden="true">IM</span>
            <div>
              <p className="eyebrow">Masukkan catatan</p>
              <h2 id="import-title">Import</h2>
              <p>Preview dan konfirmasi sebelum perubahan disimpan permanen.</p>
            </div>
          </div>

          {result ? (
            <div className="import-result" role="status">
              <span aria-hidden="true">✓</span>
              <p className="eyebrow">Import selesai</p>
              <h3>{result.imported_rows} baris disimpan</h3>
              <p>
                {result.duplicate_rows} duplikat dilewati. Hasil ini sudah
                permanen di server.
              </p>
              <code>Job {result.job_id}</code>
              <button
                className="secondary-button"
                type="button"
                onClick={resetImport}
              >
                Import file lain
              </button>
            </div>
          ) : (
            <>
              <ol className="wizard-steps" aria-label="Tahap import">
                <li aria-current={!preview ? "step" : undefined}>1. File</li>
                <li aria-current={preview ? "step" : undefined}>
                  2. Konfirmasi
                </li>
                <li>3. Selesai</li>
              </ol>
              <div className="transfer-fields import-source-fields">
                <label>
                  <span>Domain tujuan</span>
                  <select
                    value={domain}
                    disabled={Boolean(preview)}
                    onChange={(event) =>
                      void changeDomain(event.target.value as TransferDomain)
                    }
                  >
                    {transferDomains.map((item) => (
                      <option key={item} value={item}>
                        {domainLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>File CSV atau XLSX</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={!online || Boolean(preview)}
                    onChange={(event) =>
                      void selectFile(event.target.files?.[0] ?? null)
                    }
                  />
                  <small>Maksimal 2 MiB dan 500 baris.</small>
                </label>
              </div>

              {sample && !preview && (
                <>
                  <div className="mapping-head">
                    <div>
                      <h3>Mapping kolom</h3>
                      <p>Hubungkan field Rangkumin ke heading file.</p>
                    </div>
                    <span>{sample.totalRows} baris terdeteksi</span>
                  </div>
                  <div className="mapping-grid">
                    {canonicalColumns[domain].map((column) => (
                      <label key={column}>
                        <span>
                          <code>{column}</code>
                        </span>
                        <select
                          value={mapping[column] ?? ""}
                          onChange={(event) => {
                            invalidatePreview();
                            setMapping((current) => ({
                              ...current,
                              [column]: event.target.value,
                            }));
                          }}
                        >
                          <option value="">Pilih kolom sumber</option>
                          {sample.headers.map((header) => (
                            <option
                              key={header}
                              value={header}
                              disabled={Object.entries(mapping).some(
                                ([key, value]) =>
                                  key !== column && value === header,
                              )}
                            >
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="sample-table-wrap">
                    <table className="sample-table">
                      <caption>Sampel maksimum 5 baris pertama</caption>
                      <thead>
                        <tr>
                          {sample.headers.map((header) => (
                            <th scope="col" key={header}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sample.rows.map((row, index) => (
                          <tr key={index}>
                            {sample.headers.map((header) => (
                              <td key={header}>{row[header] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <fieldset className="duplicate-policy">
                    <legend>Jika ada duplikat</legend>
                    <label>
                      <input
                        type="radio"
                        name="duplicate-policy"
                        checked={policy === "reject"}
                        onChange={() => {
                          invalidatePreview();
                          setPolicy("reject");
                        }}
                      />
                      <span>
                        <b>Tolak seluruh import</b>
                        <small>Paling aman untuk audit.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="duplicate-policy"
                        checked={policy === "skip"}
                        onChange={() => {
                          invalidatePreview();
                          setPolicy("skip");
                        }}
                      />
                      <span>
                        <b>Lewati duplikat</b>
                        <small>Simpan hanya baris baru.</small>
                      </span>
                    </label>
                  </fieldset>
                </>
              )}

              {preview && (
                <div className="preview-summary">
                  <p className="eyebrow">Rencana import siap</p>
                  <h3>Periksa sebelum disimpan</h3>
                  <dl>
                    <div>
                      <dt>Total baris</dt>
                      <dd>{preview.total_rows}</dd>
                    </div>
                    <div>
                      <dt>Akan disimpan</dt>
                      <dd>{preview.accepted_rows}</dd>
                    </div>
                    <div>
                      <dt>Duplikat</dt>
                      <dd>{preview.duplicate_rows}</dd>
                    </div>
                  </dl>
                  <p>
                    Backend telah mengunci plan digest untuk job ini. Commit
                    mengunggah ulang file yang sama dan akan ditolak bila data
                    atau rencananya berubah.
                  </p>
                  <code>Job {preview.job_id}</code>
                  <label className="transfer-check confirm-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      Saya sudah memeriksa ringkasan dan memahami import
                      bersifat permanen.
                    </span>
                  </label>
                </div>
              )}

              {issues.length > 0 && (
                <section
                  className="import-issues"
                  aria-labelledby="issues-title"
                >
                  <h3 id="issues-title">{issues.length} masalah ditemukan</h3>
                  <ul>
                    {issues.map((issue, index) => (
                      <li key={`${issue.row}-${issue.field}-${index}`}>
                        <b>
                          Baris {issue.row} · {issue.field || "data"}
                        </b>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {importError && (
                <p className="form-error" role="alert">
                  {importError}
                </p>
              )}
              <div className="transfer-actions">
                {preview ? (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy !== null}
                      onClick={invalidatePreview}
                    >
                      Ubah mapping
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!online || !confirmed || busy !== null}
                      onClick={() => void runCommit()}
                    >
                      {busy === "commit"
                        ? "Menyimpan..."
                        : "Konfirmasi & import"}
                    </button>
                  </>
                ) : (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={
                      !online ||
                      !file ||
                      !sample ||
                      !mappingComplete ||
                      busy !== null
                    }
                    onClick={() => void runPreview()}
                  >
                    {busy === "inspect"
                      ? "Membaca file..."
                      : busy === "preview"
                        ? "Memvalidasi..."
                        : "Preview import"}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
