# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | :white_check_mark: |
| < 0.6   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in the Intelligent Study Planner, please report it responsibly:

1. **DO NOT** open a public GitHub issue
2. Send details to: [Your contact email - REPLACE THIS]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

## Security Considerations

### For Users

- **Never commit `.env` files** - These contain sensitive credentials
- **Use strong JWT secrets in production** - Never use the development default
- **Keep dependencies updated** - Run `npm audit` regularly
- **Protect your database** - The SQLite file contains user data
- **Secure your Google OAuth credentials** - Keep Client Secret private

### For Developers

#### Environment Variables
- All secrets belong in `.env` files (gitignored)
- Use `.env.example` as template (no real credentials)
- Rotate production secrets periodically

#### OAuth Security
- Google Client ID is public (embedded in frontend)
- Client Secret must NEVER be committed or exposed
- Configure authorized redirect URIs in Google Cloud Console
- Use HTTPS in production

#### JWT Tokens
- Development default: `your-super-secret-jwt-key-change-this-in-production` (INSECURE - placeholder only)
- Production: Use cryptographically random 256-bit secret
- Generate with: `openssl rand -base64 32`

#### Database Security
- SQLite database is local (no network exposure)
- All tables enforce user isolation via `user_id` foreign keys
- Passwords hashed with bcryptjs
- JWT tokens expire (configure via backend)

## Known Limitations

1. **No refresh token handling** - OAuth tokens expire after ~1 hour
2. **localStorage cache not user-specific** - May cause cache pollution in shared browsers
3. **No rate limiting** - Backend API has no rate limiting implemented

## Security Best Practices

### Development
```bash
# Generate strong JWT secret
openssl rand -base64 32

# Audit dependencies
npm audit
npm audit fix

# Check for secrets in commits (requires git-secrets)
git secrets --scan
```

### Production Deployment
- [ ] Use strong random JWT_SECRET (not default)
- [ ] Enable HTTPS (Let's Encrypt or cloud provider)
- [ ] Configure CORS properly (whitelist only your domain)
- [ ] Set secure cookie flags if using cookies
- [ ] Implement rate limiting (express-rate-limit)
- [ ] Enable backend request logging
- [ ] Regular backup of SQLite database
- [ ] Monitor for suspicious activity

## Dependencies

We use Dependabot to automatically scan for vulnerable dependencies. Security updates are prioritized.

### Frontend
- React 18+ (no known critical vulnerabilities)
- @react-oauth/google (official Google OAuth library)
- Vite (actively maintained, fast security patches)

### Backend
- Express (mature, well-audited)
- bcryptjs (industry-standard password hashing)
- jsonwebtoken (JWT standard implementation)
- SQLite (sql.js - WASM version, isolated sandbox)

## Disclosure Policy

- We follow **responsible disclosure** principles
- Security researchers are credited (with permission)
- Critical vulnerabilities fixed within 7 days
- Medium vulnerabilities fixed within 30 days
- Low vulnerabilities fixed in next release

## Security Updates

Security updates are documented in:
- `CHANGELOG.md` - All version changes
- GitHub Security Advisories - Critical issues
- This file - Policy updates

## Questions?

For security questions or concerns, contact: [Your contact - REPLACE THIS]

For general bugs and features, use GitHub Issues.
