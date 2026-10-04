import express from "express";
import { ZodError } from "zod";
import { InfraiError, infraiEmailGateway } from "./infrai_email.js";
import { decidePaymentNotification, paymentEventSchema } from "./payment_event_policy.js";

export const service = express();
service.use(express.json({ limit: "32kb" }));

service.post("/payment-events", async (request, response) => {
  try {
    const event = paymentEventSchema.parse(request.body);
    const decision = await decidePaymentNotification(event, infraiEmailGateway);
    response.status(200).json(decision);
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ error: "invalid_payment_event", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.status(status).json({ error: error.code, message: error.message });
      return;
    }
    response.status(500).json({ error: "payment_event_processing_failed" });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  service.listen(port, () => console.log(`payment notification service on :${port}`));
}
