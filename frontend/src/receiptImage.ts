export const MAX_RECEIPT_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_RECEIPT_OUTPUT_BYTES = 2 * 1024 * 1024;
export const MAX_RECEIPT_DIMENSION = 1800;

type ImageSourceDetails = { size: number; type: string };

export function validateReceiptImageSource(source: ImageSourceDetails) {
  if (source.size <= 0) throw new Error("File gambar kosong.");
  if (source.size > MAX_RECEIPT_SOURCE_BYTES) {
    throw new Error("Ukuran foto struk maksimal 15 MiB.");
  }
  if (source.type && !source.type.startsWith("image/")) {
    throw new Error("Pilih file gambar struk yang valid.");
  }
}

export function receiptImageDimensions(
  width: number,
  height: number,
  maxDimension = MAX_RECEIPT_DIMENSION,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    maxDimension <= 0
  ) {
    throw new Error("Dimensi gambar struk tidak valid.");
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function combineReceiptDescription(
  merchant: string | null,
  description: string | null,
  maxLength = 500,
) {
  const cleanMerchant = merchant?.trim() ?? "";
  const cleanDescription = description?.trim() ?? "";
  const combined =
    cleanMerchant && cleanDescription
      ? cleanMerchant.localeCompare(cleanDescription, undefined, {
          sensitivity: "accent",
        }) === 0
        ? cleanMerchant
        : `${cleanMerchant} - ${cleanDescription}`
      : cleanMerchant || cleanDescription;
  return combined.slice(0, maxLength).trimEnd();
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

function decodeWithImageElement(file: File): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = () => URL.revokeObjectURL(url);
    image.onload = () => {
      finish();
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => undefined,
      });
    };
    image.onerror = () => {
      finish();
      reject(new Error("Foto struk tidak dapat dibaca."));
    };
    image.src = url;
  });
}

async function decodeReceiptImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some browsers expose createImageBitmap but cannot decode camera formats.
    }
  }
  return decodeWithImageElement(file);
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Foto struk tidak dapat dikompresi.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function prepareReceiptImage(file: File) {
  validateReceiptImageSource(file);
  const decoded = await decodeReceiptImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.close();
    throw new Error("Pemrosesan gambar tidak didukung perangkat ini.");
  }

  try {
    let dimensions = receiptImageDimensions(decoded.width, decoded.height);
    while (true) {
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.drawImage(
        decoded.source,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );

      for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob.size <= MAX_RECEIPT_OUTPUT_BYTES) {
          return new File([blob], "receipt.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }

      if (dimensions.width === 1 && dimensions.height === 1) {
        throw new Error("Foto struk tidak dapat diperkecil hingga 2 MiB.");
      }
      dimensions = receiptImageDimensions(
        Math.max(1, Math.floor(dimensions.width * 0.8)),
        Math.max(1, Math.floor(dimensions.height * 0.8)),
      );
    }
  } finally {
    decoded.close();
  }
}
