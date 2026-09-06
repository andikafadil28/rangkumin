import { z } from "zod";

function decodedBase64UrlLength(value: string): number | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const unpadded = value.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) return null;
  try {
    return Uint8Array.from(
      atob(unpadded.replaceAll("-", "+").replaceAll("_", "/")),
      (character) => character.charCodeAt(0),
    ).byteLength;
  } catch {
    return null;
  }
}

const endpointSchema = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === ""
    );
  }, "endpoint wajib HTTPS dan tidak boleh memuat credential atau hash.");

const keySchema = (decodedLength: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) => decodedBase64UrlLength(value) === decodedLength,
      `${label} tidak valid.`,
    );

export const webPushDeviceIdSchema = z.string().uuid();

export const webPushStatusQuerySchema = z
  .object({ device_id: webPushDeviceIdSchema })
  .strict();

export const webPushSubscriptionSchema = z
  .object({
    endpoint: endpointSchema,
    expirationTime: z.number().int().nonnegative().nullable().default(null),
    keys: z
      .object({
        p256dh: keySchema(65, "p256dh"),
        auth: keySchema(16, "auth"),
      })
      .strict(),
  })
  .strict();

export type WebPushSubscriptionInput = z.infer<
  typeof webPushSubscriptionSchema
>;
