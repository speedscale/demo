# Fixture provenance

The responses in this directory are sanitized teaching fixtures modeled on a
production carrier response captured on 2026-08-28. They contain no customer
data or credentials. Replace the example endpoint and tracking number with your
own values before using the opt-in contract tests against a real system.

- `carrier-shipment-delayed.json` is the known response contract.
- `carrier-shipment-delayed-v2.json` intentionally renames `status` to
  `shipmentStatus` to demonstrate contract drift.
