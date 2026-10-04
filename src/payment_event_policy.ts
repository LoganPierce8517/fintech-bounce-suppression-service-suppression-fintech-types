import { z } from "zod";
import type { EmailGateway } from "./infrai_email.js";

const baseEvent = {
  eventId: z.string().min(1),
  occurredAt: z.string().datetime(),
  email: z.string().email(),
};

export const paymentEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseEvent,
    type: z.literal("payment_succeeded"),
    paymentId: z.string().min(1),
    amountMinor: z.number().int().positive(),
    currency: z.string().length(3).transform((value) => value.toUpperCase()),
  }),
  z.object({
    ...baseEvent,
    type: z.literal("delivery_hard_bounced"),
    paymentId: z.string().min(1),
  }),
]);

export type PaymentEvent = z.infer<typeof paymentEventSchema>;

export type AuditDecision = {
  eventId: string;
  paymentId: string;
  occurredAt: string;
  email: string;
  action: "receipt_sent" | "receipt_suppressed" | "hard_bounce_suppressed";
  reason: "payment_settled" | "address_suppressed" | "hard_bounce";
  messageId?: string;
};

export async function decidePaymentNotification(
  event: PaymentEvent,
  emailGateway: EmailGateway,
): Promise<AuditDecision> {
  if (event.type === "delivery_hard_bounced") {
    await emailGateway.suppressHardBounce(event.eventId, event.email);
    return {
      eventId: event.eventId,
      paymentId: event.paymentId,
      occurredAt: event.occurredAt,
      email: event.email,
      action: "hard_bounce_suppressed",
      reason: "hard_bounce",
    };
  }

  if (await emailGateway.checkSuppression(event.email)) {
    return {
      eventId: event.eventId,
      paymentId: event.paymentId,
      occurredAt: event.occurredAt,
      email: event.email,
      action: "receipt_suppressed",
      reason: "address_suppressed",
    };
  }

  const messageId = await emailGateway.sendReceipt(event);
  return {
    eventId: event.eventId,
    paymentId: event.paymentId,
    occurredAt: event.occurredAt,
    email: event.email,
    action: "receipt_sent",
    reason: "payment_settled",
    messageId,
  };
}
