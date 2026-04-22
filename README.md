# CMPE-272-Zero-Trust

Zero Trust admin portal built with Next.js. The application demonstrates strict identity verification, MFA, device trust, micro-segmented resource access, continuous monitoring, and incident response for an enterprise network.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Set `DATABASE_URL` to the PlanetScale connection string used by the app, then apply the demo database additions after the base auth schema exists:

```bash
npm run db:setup:zero-trust
```

Confirm the Zero Trust tables exist:

```bash
npm run db:check:zero-trust
```

## Zero Trust Architecture

The demo follows the Zero Trust principle of “never trust, always verify.” Every protected resource request is evaluated against the current user, role, MFA state, session status, device trust, and resource segment. The app denies access by default when no active policy matches.

Identity and access management is handled through registered users, role assignments, and JWT-backed sessions. Roles are seeded as `employee`, `manager`, and `admin`, and admin actions require an MFA-verified admin session.

MFA uses TOTP enrollment and verification. Sensitive resources require MFA verification before access is granted.

Micro-segmentation is modeled at the application layer with enterprise resource segments:

- `Employee`: HR Portal
- `Management`: Manager Reports
- `Finance`: Finance System
- `Engineering`: Engineering Repository
- `Admin`: Admin Console

Continuous monitoring is implemented with `AccessEvents`. The audit trail records authentication, MFA, device, session, resource, admin, and incident events with decision, severity, IP address, user agent, and context metadata.

Incident response is implemented with `Incidents`. Denied access to high-sensitivity resources and repeated denied resource access create or update open incidents that admins can triage, investigate, resolve, or mark as false positives.

## Work Split

Aaron implemented:

- Registration and login
- Role assignment
- TOTP MFA setup and verification
- JWT sessions and session revocation
- Trusted device registration and trust changes
- Base security dashboard

Kousik implemented:

- Zero Trust schema and seed data
- Audit logging helper and route integration
- Policy evaluator with deny-by-default access decisions
- Resource access APIs and UI
- Incident generation
- Admin monitoring and incident response APIs/UI
- Architecture report and demo checklist

## Demo Checklist

1. Register or log in as an employee.
2. Try to access a sensitive resource before MFA verification and confirm access is denied.
3. Enroll MFA, log in again with MFA, and register the current device.
4. Trust the device from the dashboard.
5. Assign manager or admin roles as an admin user.
6. Access permitted resources and confirm allowed decisions appear.
7. Attempt restricted resource access and confirm denied decisions appear.
8. As an MFA-verified admin, review the Monitoring section.
9. Confirm suspicious denied access creates an incident.
10. Update the incident status to investigating, resolved, or false positive.

## Validation

Run:

```bash
npm run lint
npm run build
```
