import { describe, expect, it } from "vitest";
import { verifyAccessJwt } from "../src/services/access";

describe("verifyAccessJwt", () => {
  it("menolak team domain non-HTTPS sebelum mengambil JWKS", async () => {
    await expect(
      verifyAccessJwt(
        "invalid-token",
        "http://test.cloudflareaccess.com",
        "test-audience",
      ),
    ).rejects.toThrow("Invalid Cloudflare Access team domain");
  });

  it("menolak host JWKS di luar cloudflareaccess.com", async () => {
    await expect(
      verifyAccessJwt(
        "invalid-token",
        "https://cloudflareaccess.com.example.com",
        "test-audience",
      ),
    ).rejects.toThrow("Invalid Cloudflare Access team domain");
  });
});
