import sharp from "sharp";
import { fileURLToPath } from "node:url";

const icon = fileURLToPath(
  new URL("../frontend/public/icons/icon-512.svg", import.meta.url),
);
const maskable = fileURLToPath(
  new URL("../frontend/public/icons/icon-maskable.svg", import.meta.url),
);
const output = (name) =>
  fileURLToPath(new URL(`../frontend/public/icons/${name}`, import.meta.url));

await Promise.all([
  sharp(icon).resize(192, 192).png().toFile(output("icon-192.png")),
  sharp(icon).resize(512, 512).png().toFile(output("icon-512.png")),
  sharp(icon).resize(180, 180).png().toFile(output("apple-touch-icon.png")),
  sharp(maskable).resize(512, 512).png().toFile(output("icon-maskable.png")),
]);

console.info("PWA icons generated in frontend/public/icons.");
