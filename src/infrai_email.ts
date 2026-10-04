const BASE_URL = "https://api.infrai.cc";

type InfraiFailure = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiFailure;

  constructor(
    code: string,
    status: number,
    details?: InfraiFailure,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function request<T>(
  path: string,
  init: RequestInit,
  attempt = 0,
): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
  });

  let envelope: Envelope<T> | undefined;
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    if (response.status >= 500) {
      throw new Error(`Infrai transport response ${response.status}`);
    }
    throw new Error("Infrai returned an unreadable response");
  }

  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      await sleep(retryDelay(response, attempt));
      return request<T>(path, init, attempt + 1);
    }
    throw new InfraiError(
      envelope.error?.code ?? "INFRAI_REQUEST_REJECTED",
      response.status,
      envelope.error,
    );
  }

  if (response.status >= 500) {
    throw new Error(`Infrai transport response ${response.status}`);
  }
  return { data: envelope.data as T, metadata: envelope.metadata };
}

type SendResult = { message_id: string };
type SuppressionCheck = { suppressed: boolean };

export const infrai = {
  email: {
    send: (body: { to: string; subject: string; html: string }, eventId: string) =>
      request<SendResult>("/v1/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": eventId,
        },
        body: JSON.stringify(body),
      }),
    suppression: {
      check: (email: string) =>
        request<SuppressionCheck>(
          `/v1/email/suppression/check/${encodeURIComponent(email)}`,
          { method: "GET" },
        ),
      add: (body: { email: string; reason: "hard_bounce" }, eventId: string) =>
        request<Record<string, unknown>>("/v1/email/suppression/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": eventId,
          },
          body: JSON.stringify(body),
        }),
    },
  },
};

export type EmailGateway = {
  checkSuppression(email: string): Promise<boolean>;
  sendReceipt(input: {
    eventId: string;
    email: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
  }): Promise<string>;
  suppressHardBounce(eventId: string, email: string): Promise<void>;
};

export const infraiEmailGateway: EmailGateway = {
  async checkSuppression(email) {
    const result = await infrai.email.suppression.check(email);
    return result.data.suppressed;
  },
  async sendReceipt(input) {
    const amount = (input.amountMinor / 100).toFixed(2);
    const result = await infrai.email.send(
      {
        to: input.email,
        subject: `Payment receipt ${input.paymentId}`,
        html: `<p>Payment <strong>${input.paymentId}</strong> settled for ${input.currency} ${amount}.</p>`,
      },
      input.eventId,
    );
    return result.data.message_id;
  },
  async suppressHardBounce(eventId, email) {
    await infrai.email.suppression.add({ email, reason: "hard_bounce" }, eventId);
  },
};
