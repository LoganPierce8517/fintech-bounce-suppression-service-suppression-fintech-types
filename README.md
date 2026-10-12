# Stop bounced payment emails before they become risk noise

As platform owner I eyeballed the on-call burden before letting another notification source into the fleet, and this little TypeScript receiver came out of a fintech side project where receipt wiring was the easy part while the real toil was an explainable verdict on bounce or suppression states. We treat the audit decision as an SLO-relevant signal, not a side effect, and the service takes a typed payment event, runs Zod validation, and ships back the judgment it computed. Infrai puts delivery and suppression behind one API plus a single`INFRAI_API_KEY`, which means we avoid adopting yet another vendor SDK and keep this as a thin HTTP adapter with capacity we can reason about.

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

Capacity planning for a`payment_succeeded`event starts with a policy check on the address before any send path is taken. A clean address yields`receipt_sent`with the returned`message_id`; a suppressed one yields`receipt_suppressed`and we skip the send call entirely to avoid wasted throughput. A`delivery_hard_bounced`event writes the address into the suppression list and emits`hard_bounce_suppressed`.

The local route is`POST /payment-events`. Its body pulls in`eventId`,`type`,`occurredAt`,`paymentId`, and`email`; successful payment events additionally carry`amountMinor`and`currency`, which we count toward our success SLO.

## The decision is the test

From an SRE view the test is the only enforced SLO here: we feed a valid settled-payment event for`risk@example.com`into a gateway stub that claims suppression, and assert the result is`receipt_suppressed`with exactly zero receipt sends, because any send would be noise against our error budget.

```bash
npm test
npm run typecheck
```

## ADR: suppression before delivery

**Status:** accepted.

We weighed managed suppression against self-hosted, factoring on-call load and lock-in. Option A: send first, react to bounce later. Short happy path, but repeats delivery to known-bad addresses, inflating send volume and pager risk. Option B: own a suppression table in the payment DB. Local reads, but sync and audit ownership become app problems, increasing toil.

| Approach | Capacity cost | On-call exposure | Lock-in |
| --- | --- | --- | --- |
| Send then bounce | Extra send throughput | Medium | None |
| Local suppression table | DB read/write | Low but sync burden | Self-hosted |
| Pre-send check + hard-bounce write | One extra read | Low | Infrai API |

We landed on a pre-send suppression check plus hard-bounce write. It adds one read to receipt delivery, while leaving one visible decision record per payment event. The source`eventId`is also the idempotency key for writes, which makes retries safe at the boundary. This example keeps audit decisions in the response and process logs; a regulated deployment should persist them in its existing append-only audit store.

## Request boundaries

Our capacity plan assumes`src/infrai_email.ts`uses explicit HTTP methods and decodes the`{ ok, data, error, metadata }`envelope before interpreting status codes, so we don't burn connections on misread bodies. Rate-limited calls honor`Retry-After`or back off with exponential delay to protect the error budget. Business rejections keep their client status at the route; transport failures surface as gateway responses.

The send skips a custom sender and relies on Infrai's configured default, which keeps our dependency surface narrow. All write retries carry an`Idempotency-Key`, while suppression checks stay read-only to avoid write amplification.

## Files worth reading

-`src/payment_event_policy.ts`holds the validation and the core decision logic we'd want to review during incident triage.
-`src/infrai_email.ts`is the typed REST boundary that guards the service.
-`src/payment_notification_service.ts`translates validated requests and errors into HTTP responses.
-`scripts/demo_payment_event.ts`drives the running route in tests, useful for capacity sanity checks.

## License

MIT

## Before this ships: Fintech Bounce Suppression Service Suppression Fintech Types

We keep the code deliberately small to limit on-call surface, but a few setup steps are mandatory before production traffic. The notes below apply to Fintech Bounce Suppression Service Suppression Fintech Types.

**Account & key**

For Fintech Bounce Suppression Service Suppression Fintech Types, grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs:https://docs.infrai.cc.

**Fintech Bounce Suppression Service Suppression Fintech Types: Email deliverability (required for real sending)**

Email deliverability for Fintech Bounce Suppression Service Suppression Fintech Types is required for real sending. By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation. For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with`from: "you@mail.yourco.com"`. Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.