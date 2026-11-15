This reference catalog organizes standard authentication, session, identity, and authorization endpoints across modern REST APIs and OAuth 2.0 / OpenID Connect (OIDC) implementations so you can audit your service listings for completeness.

### 1. Core Authentication & Session Lifecycle

These endpoints handle initial sign-up, credential validation, and session state.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` | `/auth/register` or `/auth/signup` | Creates a new user account, validates password policy, and triggers verification emails. |
| `POST` | `/auth/login` or `/auth/signin` | Authenticates primary credentials (email/username + password) and issues session cookies or token pairs. |
| `POST` | `/auth/logout` or `/auth/signout` | Terminates the current session, clears `HttpOnly` cookies, and invalidates the active refresh token. |
| `POST` | `/auth/logout-all` | Revokes all active sessions and refresh tokens across every device for the authenticated user. |
| `GET` | `/auth/session` or `/auth/me` | Returns the currently authenticated user's profile, roles, permissions, and active session metadata. |
| `GET` | `/auth/sessions` | Lists all active sessions/devices (IP address, user-agent, last active timestamp) for security auditing. |
| `DELETE` | `/auth/sessions/{sessionId}` | Revokes a specific remote session or device. |

---

### 2. Token Management (JWT / OAuth 2.0 / OIDC)

If your services use stateless bearer tokens or act as an Authorization Server / Identity Provider, audit against these standard routes.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `GET` / `POST` | `/oauth/authorize` | Initiates Authorization Code (with PKCE) or consent flows via browser redirect. |
| `POST` | `/oauth/par` | **Pushed Authorization Request (RFC 9126):** Submits auth parameters directly via back-channel before browser redirect. |
| `POST` | `/oauth/token` or `/auth/refresh` | Exchanges an authorization code, refresh token, or client credentials for new access/ID tokens. |
| `POST` | `/oauth/revoke` or `/auth/revoke` | Explicitly invalidates an active refresh token or access token (RFC 7009). |
| `POST` | `/oauth/introspect` | **Token Introspection (RFC 7662):** Allows resource servers to validate opaque tokens and inspect active scopes/claims. |
| `GET` | `/oauth/userinfo` | **OIDC UserInfo:** Returns standardized identity claims (`sub`, `email`, `name`) for the bearer token. |
| `GET` / `POST` | `/oauth/logout` or `/oidc/end-session` | **RP-Initiated Logout:** Ends the Single Sign-On (SSO) session at the Identity Provider. |
| `POST` | `/oauth/device/code` | **Device Authorization Grant (RFC 8628):** Issues device/user codes for CLI tools, smart TVs, or headless devices. |

---

### 3. Password & Account Recovery

Endpoints required for self-service credential recovery and hygiene.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` | `/auth/password/forgot` | Accepts an email/identifier and dispatches a time-limited password reset token or link (always returns a generic `200`/`202` to prevent user enumeration). |
| `POST` | `/auth/password/verify-token` | *(Optional)* Validates whether a reset token is still valid and unexpired before rendering the new-password form. |
| `POST` | `/auth/password/reset` | Consumes the one-time reset token alongside the new password and invalidates existing sessions. |
| `POST` / `PUT` | `/auth/password/change` | Updates the password for an already-authenticated user (requires verifying the current password). |

---

### 4. Account Verification & Contact Updates

Endpoints for proving ownership of email addresses or phone numbers.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` / `GET` | `/auth/verify-email` | Confirms account email ownership using a one-time token or OTP code. |
| `POST` | `/auth/verify-email/resend` | Re-issues the email verification link/code (typically rate-limited). |
| `POST` | `/auth/verify-phone` | Confirms phone number ownership via SMS/voice OTP. |
| `POST` | `/auth/email/change` | Initiates an email address update by sending a verification challenge to the new address before committing the change. |

---

### 5. Multi-Factor Authentication (MFA / 2FA)

Endpoints covering TOTP authenticator apps, SMS/email OTPs, and recovery codes.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` | `/auth/mfa/enroll` or `/auth/mfa/setup` | Generates a TOTP secret/QR URI or initiates SMS/WebAuthn factor registration. |
| `POST` | `/auth/mfa/enroll/verify` | Confirms the initial OTP code to activate MFA on the account and returns one-time backup recovery codes. |
| `POST` | `/auth/mfa/challenge` | Triggers an out-of-band OTP delivery (SMS/email) during a step-up or login flow. |
| `POST` | `/auth/mfa/verify` | Completes a pending login (`mfa_token` + OTP/recovery code) and upgrades the session to fully authenticated. |
| `GET` | `/auth/mfa/factors` | Lists enrolled MFA methods (e.g., Authenticator App, SMS, Security Key) for the user. |
| `DELETE` | `/auth/mfa/factors/{factorId}` | Unenrolls/disables a specific MFA factor (requires step-up authentication or current password). |
| `POST` | `/auth/mfa/recovery-codes/regenerate` | Invalidates old backup codes and generates a fresh set. |

---

### 6. Passwordless, Passkeys (WebAuthn) & Social SSO

Modern passwordless and federated identity endpoints.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` | `/auth/magic-link/request` | Sends a single-use sign-in link or OTP code to the user's email/phone. |
| `POST` / `GET` | `/auth/magic-link/verify` | Exchanges the magic-link token or OTP for an active session. |
| `POST` | `/auth/webauthn/register/options` | Generates a cryptographic challenge and `PublicKeyCredentialCreationOptions` for registering a passkey/security key. |
| `POST` | `/auth/webauthn/register/verify` | Verifies the attestation response and stores the user's public key credential. |
| `POST` | `/auth/webauthn/login/options` | Generates a challenge and `PublicKeyCredentialRequestOptions` for passkey authentication. |
| `POST` | `/auth/webauthn/login/verify` | Verifies the signed assertion and establishes an authenticated session. |
| `GET` | `/auth/sso/{provider}` | Initiates an external OAuth/OIDC or SAML redirect (e.g., `/auth/sso/google`, `/auth/sso/saml`). |
| `GET` / `POST` | `/auth/sso/{provider}/callback` | Receives the authorization code or SAML assertion from the external IdP, links/provisions the user, and issues local tokens. |
| `DELETE` | `/auth/sso/{provider}/unlink` | Disconnects a linked external identity provider from the user's account. |

---

### 7. Machine-to-Machine (M2M), API Keys & Service Discovery

Often overlooked during internal microservice or developer-portal audits.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `GET` | `/.well-known/openid-configuration` | **OIDC Discovery:** Publishes issuer URL, supported scopes, grant types, and endpoint locations. |
| `GET` | `/.well-known/jwks.json` | **JSON Web Key Set (JWKS):** Exposes public signing keys so downstream services can verify JWT signatures locally without calling the auth service. |
| `GET` | `/.well-known/oauth-authorization-server` | **OAuth 2.0 Metadata (RFC 8414):** Standard discovery document for non-OIDC OAuth servers. |
| `POST` | `/auth/api-keys` | Generates a scoped personal access token (PAT) or service API key (returns the raw secret once). |
| `GET` | `/auth/api-keys` | Lists active API keys (prefix/metadata only, never the raw secret), scopes, and expiration dates. |
| `POST` | `/auth/api-keys/{keyId}/rotate` | Issues a replacement key with an optional grace period before revoking the old key. |
| `DELETE` | `/auth/api-keys/{keyId}` | Immediately revokes an API key. |

---

### 8. Administrative & Compliance Endpoints (Internal / RBAC-Protected)

Useful if your services expose user-management or audit capabilities to admins or other internal domains.

| HTTP Method | Conventional Route | Purpose & Notes |
| --- | --- | --- |
| `POST` | `/admin/users/{userId}/lock` (or `/suspend`) | Immediately disables login and revokes active tokens for a compromised or suspended account. |
| `POST` | `/admin/users/{userId}/unlock` | Re-enables a locked or rate-limit-blocked account. |
| `POST` | `/admin/users/{userId}/impersonate` | Issues a short-lived, audit-logged token allowing support engineers to view the app as the target user. |
| `GET` | `/admin/auth/audit-logs` | Queries authentication events (failed logins, MFA resets, token revocations, IP anomalies). |
| `POST` | `/oauth/register` | **Dynamic Client Registration (RFC 7591):** Programmatically registers OAuth client apps and redirect URIs. |