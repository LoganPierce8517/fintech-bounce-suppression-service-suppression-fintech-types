import assert from "node:assert/strict";
import test from "node:test";
import type { EmailGateway } from "../src/infrai_email.js";
import { decidePaymentNotification, paymentEventSchema } from "../src/payment_event_policy.js";

test("a suppressed address never receives a payment receipt", async () => {
  let sendCount = 0;
  const gateway: EmailGateway = {
    async checkSuppression() { return true; },
    async sendReceipt() { sendCount += 1; return "msg_unexpected"; },
    async suppressHardBounce() {},
  };
  const event = paymentEventSchema.parse({
    eventId: "evt_101",
    type: "payment_succeeded",
    occurredAt: "2026-09-30T09:30:00.000Z",
    paymentId: "pay_101",
    email: "risk@example.com",
    amountMinor: 12500,
    currency: "usd",
  });

  const decision = await decidePaymentNotification(event, gateway);

  assert.equal(sendCount, 0);
  assert.equal(decision.action, "receipt_suppressed");
  assert.equal(decision.reason, "address_suppressed");
});

test("a hard bounce is recorded with the source event id", async () => {
  const writes: Array<{ eventId: string; email: string }> = [];
  const gateway: EmailGateway = {
    async checkSuppression() { return false; },
    async sendReceipt() { return "msg_101"; },
    async suppressHardBounce(eventId, email) { writes.push({ eventId, email }); },
  };
  const event = paymentEventSchema.parse({
    eventId: "evt_bounce_12",
    type: "delivery_hard_bounced",
    occurredAt: "2026-09-30T10:00:00.000Z",
    paymentId: "pay_101",
    email: "closed@example.com",
  });

  const decision = await decidePaymentNotification(event, gateway);

  assert.deepEqual(writes, [{ eventId: "evt_bounce_12", email: "closed@example.com" }]);
  assert.equal(decision.action, "hard_bounce_suppressed");
});
