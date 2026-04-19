# Account Security Policy

*Last updated: 2026-04-19*

---

## Authentication

- JWT tokens are signed with `JWT_SECRET` (env var). The default value is insecure — **always set a strong secret in production**.
- Tokens expire after 7 days by default (`JWT_EXPIRES_IN`).
- Passwords are hashed with bcrypt (cost factor 10).

## Email Verification

- New accounts receive an email verification code on signup.
- Some sensitive actions require a verified email address.
- Verification codes expire after 15 minutes.

## Two-Step Login

- Admins and flagged accounts may be prompted for an email-based one-time code on login from an unrecognised device.
- Device trust is stored as a cookie valid for `DEVICE_TRUST_DAYS` days (default: 30).

## Password Reset

- Password reset links are single-use and expire after 60 minutes.
- Tokens are stored as a SHA-256 hash in the database (never the raw token).

## Rate Limiting

| Action | Limit |
|---|---|
| Login attempts | 10 per IP per 15 min |
| Signup | 5 per IP per hour |

## Role Escalation

- Public signup can produce `customer` or `owner` roles only.
- Admin and other privileged roles must be assigned by an existing admin via `PUT /api/v1/users/:id`.

## Production Checklist

- [ ] `JWT_SECRET` set to a cryptographically random 64-char string
- [ ] HTTPS enforced (no HTTP in production)
- [ ] `TRUST_PROXY` configured correctly behind a reverse proxy
- [ ] Default admin account password changed after first login
- [ ] `NODE_ENV=production` to suppress stack traces in error responses
