const response = await fetch("http://localhost:3000/payment-events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    eventId: "evt_demo_2026_09_30",
    type: "payment_succeeded",
    occurredAt: "2026-09-30T09:30:00.000Z",
    paymentId: "pay_4821",
    email: process.env.DEMO_CUSTOMER_EMAIL ?? "customer@example.com",
    amountMinor: 2599,
    currency: "usd",
  }),
});

console.log(await response.json());
