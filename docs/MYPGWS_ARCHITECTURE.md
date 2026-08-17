# MyPGWS / P31 Portal Architecture

## Product boundaries

### Pretty Girls Who Serve public site

Public mission, chapters, faith resources, community previews, membership information, privacy, terms, support, and login.

### MyPGWS / P31 Portal

Paid or verified-lifetime member experience with a dedicated member ID, profile, digital card, onboarding, service, events, chapters, opportunities, documents, announcements, support, faith resources, and intentional product switching.

### PGWS Nationals administration

Separate protected interface for members, payments, legacy migration, MyEFF connection status, chapters, service approvals, events, resources, communications, support, settings, and audit history.

### MyEFF

Separate free EFF national membership and identity. PGWS membership never replaces MyEFF and MyEFF never becomes the source of PGWS payment truth.

## Status model

### Account status

- unverified
- verified
- disabled

### Payment status

- not_required
- pending
- paid
- failed
- refunded
- disputed

### Membership status

- pending
- active
- suspended
- revoked
- archived

### Membership source

- stripe
- legacy_joinit
- complimentary
- administrative_reconciliation

### MyEFF connection status

- not_started
- activation_ready
- linked
- retrying
- needs_review

## Security

- PGWS browser sessions come from Supabase Auth.
- Server endpoints validate the bearer token with the PGWS Supabase Auth API.
- Server-only database writes use the PGWS service-role key.
- Admin endpoints also require an active `pgws_admin_roles` record.
- Stripe webhooks use the raw request body and official signature verification.
- Stripe event IDs, Checkout Session IDs, Payment Intent IDs, and membership IDs are unique.
- Every administrative mutation writes to `pgws_audit_log`.
- Journal ciphertext remains outside all administrative views.
- Private documents use a private storage bucket and short-lived signed URLs.

## Payment and activation

1. Authenticated account requests checkout.
2. The server checks for an active membership and open Checkout Session.
3. The server creates or reuses one Checkout Session.
4. `checkout.session.completed` with confirmed payment activates membership.
5. Delayed-payment success activates membership; failure does not.
6. Duplicate webhook deliveries return success without duplicate records.
7. Refunds and disputes preserve the record and create a needs-attention item; they do not silently destroy member history.
8. The onboarding email is sent once, keyed by membership and template.

## Legacy member migration

The importer accepts CSV rows, normalizes email, preserves source IDs and dates, records row-level validation results, and never upgrades an unmatched website account without a legacy record. A verified email match can claim the legacy membership. Ambiguous or duplicate rows are held for administrator review.

## MyEFF access

PGWS membership activation creates a minimal connection record and a short-lived signed activation URL. The member intentionally opens MyEFF, verifies the email, and either links the existing MyEFF profile or creates a free EFF national member profile. MyPGWS records the final MyEFF member ID and connection state; it never stores the MyEFF password.

## Deployment

- Public PGWS site and P31 Portal remain in the existing PGWS Vercel project.
- The real custom domain becomes the canonical origin.
- `pretty-girls-who-serve.vercel.app` redirects to the custom domain after DNS is verified.
- All secrets are stored in Vercel Production and Preview environments.
- Database migrations are applied before enabling live Stripe checkout.

