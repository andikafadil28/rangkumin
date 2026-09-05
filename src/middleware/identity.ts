import { createMiddleware } from "hono/factory";
import type { AppEnv, AuthenticatedUser } from "../types";
import { verifyAccessJwt } from "../services/access";

const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

type UserRow = {
  id: string;
  display_name: string;
};

type AccessVerifier = typeof verifyAccessJwt;

export function createIdentityMiddleware(
  verifyToken: AccessVerifier = verifyAccessJwt,
) {
  return createMiddleware<AppEnv>(async (context, next) => {
    let email: string | undefined;

    if (context.env.APP_ENV === "production") {
      const assertion = context.req.header(ACCESS_JWT_HEADER);
      const { ACCESS_AUD: audience, ACCESS_TEAM_DOMAIN: teamDomain } =
        context.env;

      if (!audience || !teamDomain) {
        return context.json(
          {
            error: "Service Unavailable",
            message: "Konfigurasi autentikasi belum tersedia.",
          },
          503,
        );
      }

      if (!assertion) {
        return context.json(
          {
            error: "Unauthorized",
            message: "Token Cloudflare Access tidak tersedia.",
          },
          401,
        );
      }

      try {
        email = await verifyToken(assertion, teamDomain, audience);
      } catch {
        return context.json(
          {
            error: "Unauthorized",
            message: "Token Cloudflare Access tidak valid.",
          },
          401,
        );
      }
    } else {
      email = context.req.header(ACCESS_EMAIL_HEADER)?.trim().toLowerCase();
    }

    if (!email || email.length > 254) {
      return context.json(
        {
          error: "Unauthorized",
          message: "Identitas Cloudflare Access tidak tersedia.",
        },
        401,
      );
    }

    const user = await context.env.DB.prepare(
      `SELECT id, display_name
       FROM users
       WHERE email = ?1 COLLATE NOCASE
         AND is_active = 1
       LIMIT 1`,
    )
      .bind(email)
      .first<UserRow>();

    if (!user) {
      return context.json(
        {
          error: "Forbidden",
          message: "Akun belum terdaftar sebagai pengguna Rangkumin.",
        },
        403,
      );
    }

    const currentUser: AuthenticatedUser = {
      id: user.id,
      displayName: user.display_name,
    };

    context.set("currentUser", currentUser);
    await next();
  });
}

export const identityMiddleware = createIdentityMiddleware();
