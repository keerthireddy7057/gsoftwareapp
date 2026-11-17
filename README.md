# Gym Management & Member Retention Prototype

A mobile-first static prototype for a local Indian gym. It includes role-based demo login, member and admin/staff workflows, QR-style attendance check-in, no-show red list, renewals, simulated payments, add-on marketplace, notifications, analytics, and realistic sample data.

## Open The App

Open `index.html` in a browser.

Demo logins:

- Admin: `admin@gym.local` / `demo123`
- Front desk: `frontdesk@gym.local` / `demo123`
- Member: `aarav@gym.local` / `demo123`

## Run Tests

```powershell
node tests/domain.test.js
```

The tests cover duplicate check-ins, membership status checks, inactive member return resolution, verified payment extension, duplicate payment confirmation, out-of-stock orders, trainer availability, and opt-out reminder suppression.
