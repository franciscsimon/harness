/**
 * Keycloak OIDC JWT verification middleware for Hono.
 * Validates Bearer tokens against Keycloak's JWKS endpoint.
 */
import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://localhost:8180";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "harness";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID ?? "harness-api";

// Public paths that don't require auth
// Note: harness-ui on :3336 fetches these server-side (no user token available)
const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/health/primary",
  "/api/health/replica",
  "/api/health/redpanda",
  "/api/incidents",
  "/api/backups",
  "/api/replication",
  "/api/scheduler/status",
  "/api/lifecycle/events",
  "/api/ci/events",
  "/api/topics",
  "/api/replica/status",
  "/api/replica/start",
  "/api/replica/stop",
  "/api/restore",
]);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  if (!jwks) {
    const jwksUrl = new URL(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`);
    jwks = createRemoteJWKSet(jwksUrl);
  }
  return jwks;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
}

function extractUser(payload: JWTPayload): AuthUser {
  const realmAccess = (payload as any).realm_access;
  const roles: string[] = realmAccess?.roles ?? [];
  return {
    sub: payload.sub ?? "unknown",
    email: (payload as any).email,
    name: (payload as any).preferred_username ?? (payload as any).name,
    roles,
  };
}

/**
 * Auth middleware — validates JWT Bearer token.
 * Set AUTH_ENABLED=false to disable (dev mode).
 */
export function authMiddleware(): MiddlewareHandler {
  const enabled = process.env.AUTH_ENABLED !== "false";

  return async (c, next) => {
    // Skip auth if disabled
    if (!enabled) return next();

    // Skip public paths (exact match)
    if (PUBLIC_PATHS.has(c.req.path)) return next();

    // Skip public path prefixes (dynamic routes used by ops.js)
    const publicPrefixes = ["/api/backup/", "/api/backups/", "/dashboard"];
    if (publicPrefixes.some(p => c.req.path.startsWith(p))) return next();

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJWKS(), {
        issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
        audience: KEYCLOAK_CLIENT_ID,
      });
      (c as any).user = extractUser(payload);
      return next();
    } catch (err) {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  };
}

/**
 * Get the authenticated user from the context.
 */
export function getUser(c: any): AuthUser | null {
  return (c as any).user ?? null;
}
