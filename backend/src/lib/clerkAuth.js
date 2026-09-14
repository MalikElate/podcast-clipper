import { getAuth } from "@clerk/express";

/**
 * Express middleware that requires a valid Clerk session token and exposes a
 * stable user ID to the existing job authorization code.
 */
export function requireAuth(req, res, next) {
  const { isAuthenticated, userId, sessionClaims } = getAuth(req);

  if (!isAuthenticated || !userId) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ error: "Authentication required.", code: "authentication_required" });
  }

  req.uid = userId;
  req.userEmail = sessionClaims?.email || null;
  next();
}
