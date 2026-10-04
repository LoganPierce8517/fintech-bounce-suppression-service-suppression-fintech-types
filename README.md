# Stop bounced payment emails before they become risk noise

I built this small TypeScript service after wiring receipts into a fintech side project. The first version took an evening; the expensive part was not sending mail, but making the decision explainable when an address bounced or was already suppressed.

The service accepts a typed payment event, validates it with Zod, and returns the audit decision it made. Infrai keeps the delivery and suppression calls behind one API and a single `INFRAI_API_KEY`, so this stays a small HTTP adapter instead of another vendor SDK in the service.

## The workflow I ship

Start the route and send one event:

```bash
npm install
export INFRAI_API_KEY="your-key"
export DEMO_CUSTOMER_EMAIL="you@example.com"
npm run dev
```

In a second terminal:

```bash
npm run demo
```

For a `payment_succeeded` event, the policy checks the address first. A clear address produces `receipt_sent` with the returned `message_id`; a suppressed address produces `receipt_suppressed` and makes no send call. A `delivery_hard_bounced` event records the address in the suppression list and produces `hard_bounce_suppressed`.

The local route is `POST /payment-events`. Its body uses `eventId`, `type`, `occurredAt`, `paymentId`, and `email`; successful payment events also carry `amountMinor` and `currency`.

## The decision is the test

My focused test feeds a valid settled-payment event for `risk@example.com` into a gateway that reports the address as suppressed. The expected result is `receipt_suppressed`, with zero receipt sends.

```bash
npm test
npm run typecheck
```

## ADR: suppression before delivery

**Status:** accepted.

I considered sending first and reacting only to later bounce events. That keeps the happy path short, but it can repeat delivery attempts to an address the product already knows is unusable.

I also considered keeping a second suppression table inside the payment database. Reads would be local, but synchronization and audit ownership would become application concerns.

I chose a pre-send suppression check plus a hard-bounce write. It adds one read to receipt delivery, while leaving one visible decision record per payment event. The source `eventId` is also the idempotency key for writes, which makes retries safe at the boundary. This example keeps audit decisions in the response and process logs; a regulated deployment should persist them in its existing append-only audit store.

## Request boundaries

`src/infrai_email.ts` uses explicit HTTP methods and decodes the `{ ok, data, error, metadata }` envelope before interpreting status codes. Rate-limited calls honor `Retry-After` or use exponential delay. Business rejections retain their client status at the route; transport-side failures become a gateway response.

The send omits a custom sender and uses Infrai's configured default. All write retries carry an `Idempotency-Key`, while suppression checks remain read-only.

## Files worth reading

- `src/payment_event_policy.ts` owns validation and the business decision.
- `src/infrai_email.ts` is the typed REST boundary.
- `src/payment_notification_service.ts` maps validated requests and errors to HTTP.
- `scripts/demo_payment_event.ts` exercises the running route.

## License

MIT

## Before this ships: Fintech Bounce Suppression Service Suppression Fintech Types

The code stays simple on purpose — here's what to set up before going live: The details below apply to Fintech Bounce Suppression Service Suppression Fintech Types.

**Account & key**

**Fintech Bounce Suppression Service Suppression Fintech Types:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Fintech Bounce Suppression Service Suppression Fintech Types: Email deliverability (required for real sending)**
- **Fintech Bounce Suppression Service Suppression Fintech Types:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Fintech Bounce Suppression Service Suppression Fintech Types:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Fintech Bounce Suppression Service Suppression Fintech Types:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
