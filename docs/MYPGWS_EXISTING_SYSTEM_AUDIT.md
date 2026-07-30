# MyPGWS Existing-System Audit

Date: July 30, 2026

## Executive finding

Pretty Girls Who Serve already has a strong public site, a Supabase-authenticated community, a five-profile opt-in directory, a Sister Lounge, moderated community posts, and the private encrypted Her Return journal. Those systems must be preserved.

The existing “member portal” is an account/profile feature, not a verified membership system. Any newly registered account can currently enter it, and the public $20 membership buttons still point to Join It. Payment, membership, and account state are not separated.

## Current PGWS system

- Repository: `estherfundsfoundation-sys/pretty-girls-who-serve`
- Production project: `esther-funds/pretty-girls-who-serve`
- Current production alias: `pretty-girls-who-serve.vercel.app`
- Supabase project: `tocnikeuyitavjsbrhkp` (`pgws-community`)
- Existing public tables:
  - `pgws_profiles`
  - `pgws_lounge_messages`
  - `pgws_posts`
  - `pgws_private_journal_entries`
- Existing authentication: Supabase email/password and email-link flows
- Existing journal: browser-side AES-GCM encryption; PGWS Nationals cannot read stored content
- Existing custom domain: `prettygirlswhoserve.org` resolves to GoDaddy forwarding IPs and is not attached to the Vercel project
- Existing `www.prettygirlswhoserve.org`: no DNS record at audit time
- Existing Stripe environment: none on the PGWS Vercel project
- Existing legacy membership export: not found in the provided workspace or Downloads folder

## Current MyEFF system

- Repository: `estherfundsfoundation-sys/my-eff`
- Production project: `esther-funds/my-eff`
- Production alias: `my-eff.vercel.app`
- Intended custom domain: `my.estherfundsfoundation.org`
- Supabase project: `voljlrqyruluuqrfqwww` (`myeff-membership-portal`)
- Existing membership records: approximately 739 member profiles and 969 membership-history records at audit time
- EFF national membership is free
- MyEFF already supports:
  - account claim and email verification
  - membership IDs and history
  - onboarding and certificates
  - service, education, event, and document records
  - announcements, events, check-ins, support requests, directory, and administration

## Identity decision

PGWS and MyEFF use different Supabase authentication projects. Passwords and private sessions must never be copied between them.

The safe cross-system pattern is:

1. MyPGWS activates from a verified Stripe webhook, an imported legacy record, or an authorized complimentary grant.
2. MyPGWS creates a short-lived, signed MyEFF activation entitlement containing only the minimum identity and membership fields.
3. The member intentionally opens MyEFF and verifies/creates the separate MyEFF account.
4. Existing MyEFF records are preserved and linked; no duplicate record is created.
5. PGWS stores only the MyEFF connection status and IDs needed for the member to switch products.

## Payment decision

A generic public Stripe Payment Link cannot be the primary unlock because it cannot reliably bind a payment to the authenticated PGWS user.

The required flow is:

1. Member creates or signs into a PGWS account.
2. Server creates a Stripe Checkout Session using the approved one-time Price ID.
3. Checkout metadata contains internal identifiers only.
4. Stripe sends a webhook.
5. The server verifies the raw-body Stripe signature.
6. The webhook is stored idempotently.
7. Only the verified webhook activates the membership.
8. The browser success page polls membership status and never activates access itself.

## Data-separation rules

- PGWS and MyEFF keep separate membership IDs, roles, brands, and administrative permissions.
- Private PGWS journal content is never copied to MyEFF.
- Private prayer content is never copied to MyEFF.
- PGWS moderation history is not exposed in MyEFF except through an explicitly authorized safety or conduct process.
- Stripe secrets and Supabase service-role keys remain server-only.
- Existing Her Return journal users retain account and export access even when they are not yet verified paid PGWS members.
- An existing PGWS website account is not automatically treated as a paid member.
- An imported paid Join It member is not asked to pay again.

## Required external setup before live payment launch

- A Stripe account that legally belongs to the PGWS business receiving the $20 membership revenue
- Stripe Product: `PGWS Lifetime Membership`
- One-time Price: `$20.00 USD`
- PGWS Supabase service-role key installed server-side
- Stripe secret key, publishable key, Price ID, and webhook signing secret installed server-side
- A legacy Join It CSV/XLSX export for no-charge member migration
- The PGWS custom domain attached to Vercel, with GoDaddy forwarding removed and Vercel DNS records installed

## Preserved systems

The implementation must preserve and regression-test:

- public PGWS site
- Her Return curriculum and encrypted journal
- HER Bible
- public community and moderated posts
- opt-in directory
- Sister Lounge
- chapter resources
- academy previews
- Supabase authentication

