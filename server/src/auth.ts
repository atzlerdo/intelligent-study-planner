/**
 * ============================================================================
 * JWT AUTHENTICATION MIDDLEWARE
 * ============================================================================
 * 
 * Handles JSON Web Token (JWT) authentication for all protected API routes.
 * 
 * AUTHENTICATION FLOW:
 * 1. User registers/logs in → receives JWT token
 * 2. Client stores token in localStorage
 * 3. Client includes token in Authorization header: "Bearer <token>"
 * 4. authMiddleware validates token and attaches user to request
 * 5. Protected routes access req.user.userId
 * 
 * TOKEN STRUCTURE:
 * - Payload: { userId, email }
 * - Expiry: 7 days
 * - Signing: HMAC SHA256 with JWT_SECRET
 * 
 * SECURITY:
 * - JWT_SECRET should be set via environment variable in production
 * - Tokens are signed but NOT encrypted (don't store sensitive data)
 * - No refresh token mechanism (user must re-login after 7 days)
 * 
 * @see https://jwt.io/
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// Secret key for signing JWTs (set via environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';

/**
 * JWT payload structure
 * Contains user identity information
 */
export interface JWTPayload {
  userId: string;   // User UUID from database
  email: string;    // User email address
}

/**
 * Extended Express Request with user authentication
 * Used in protected routes to access authenticated user
 */
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

/**
 * Generate JWT token for authenticated user
 * 
 * @param payload User identity (userId, email)
 * @returns Signed JWT token string
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify and decode JWT token
 * 
 * @param token JWT token string
 * @returns Decoded payload
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

/**
 * Express middleware for JWT authentication
 * 
 * Validates Authorization header and attaches user to request.
 * Returns 401 if token is missing, invalid, or expired.
 * 
 * Usage:
 * ```typescript
 * router.get('/protected', authMiddleware, (req: AuthRequest, res) => {
 *   const userId = req.user!.userId;
 *   // ... access protected resource
 * });
 * ```
 * 
 * @param req Express request (extended with user property)
 * @param res Express response
 * @param next Next middleware function
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Check for Authorization header with Bearer scheme
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  // Extract token (remove "Bearer " prefix)
  const token = authHeader.substring(7);

  try {
    // Verify token and attach user to request
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    // Token invalid or expired
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
