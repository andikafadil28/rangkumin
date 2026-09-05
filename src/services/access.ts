import { createRemoteJWKSet, jwtVerify } from "jose";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string): string {
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".cloudflareaccess.com") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Invalid Cloudflare Access team domain");
  }

  return url.origin;
}

export async function verifyAccessJwt(
  assertion: string,
  teamDomain: string,
  audience: string,
): Promise<string> {
  const issuer = normalizeTeamDomain(teamDomain);
  let keySet = keySets.get(issuer);

  if (!keySet) {
    keySet = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", `${issuer}/`));
    keySets.set(issuer, keySet);
  }

  const { payload } = await jwtVerify(assertion, keySet, {
    algorithms: ["RS256"],
    audience,
    issuer,
  });

  if (typeof payload.email !== "string") {
    throw new Error("Cloudflare Access JWT does not contain an email");
  }

  const email = payload.email.trim().toLowerCase();

  if (!email || email.length > 254) {
    throw new Error("Cloudflare Access JWT contains an invalid email");
  }

  return email;
}
