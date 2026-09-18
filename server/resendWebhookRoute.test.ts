import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/resendWebhook", () => ({
  verifyResendWebhookSignature: vi.fn(),
}));

vi.mock("./resendWebhookInbox", () => ({
  describeResendWebhookEvent: vi.fn(),
  enqueueResendWebhookEvent: vi.fn(),
}));

import { verifyResendWebhookSignature } from "./_core/resendWebhook";
import { describeResendWebhookEvent, enqueueResendWebhookEvent } from "./resendWebhookInbox";
import { registerResendWebhookRoute } from "./resendWebhookRoute";

type CapturedHandler = (req: any, res: any) => Promise<unknown>;

function registerAndCapture(): CapturedHandler {
  let handler: CapturedHandler | undefined;
  const app = {
    post: vi.fn((_path: string, _rawBodyMiddleware: unknown, routeHandler: CapturedHandler) => {
      handler = routeHandler;
    }),
  };
  registerResendWebhookRoute(app as any);
  expect(app.post).toHaveBeenCalledWith(
    "/api/webhooks/resend",
    expect.any(Function),
    expect.any(Function)
  );
  if (!handler) throw new Error("Webhook handler was not registered");
  return handler;
}

function responseSpy() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe("Resend webhook route", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
  });

  it("fails closed and never queues a callback when verification is unconfigured", async () => {
    const handler = registerAndCapture();
    const res = responseSpy();

    await handler({ body: Buffer.from('{"type":"email.opened","data":{}}'), headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "Webhook verification is not configured" });
    expect(verifyResendWebhookSignature).not.toHaveBeenCalled();
    expect(describeResendWebhookEvent).not.toHaveBeenCalled();
    expect(enqueueResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before queueing a callback", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_c2VjcmV0";
    vi.mocked(verifyResendWebhookSignature).mockReturnValue(false);
    const handler = registerAndCapture();
    const res = responseSpy();

    await handler({
      body: Buffer.from('{"type":"email.opened","data":{}}'),
      headers: { "svix-signature": "invalid", "svix-id": "msg_1", "svix-timestamp": "123" },
    }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(enqueueResendWebhookEvent).not.toHaveBeenCalled();
  });

  it("queues only a verified callback", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_c2VjcmV0";
    vi.mocked(verifyResendWebhookSignature).mockReturnValue(true);
    vi.mocked(describeResendWebhookEvent).mockReturnValue({
      svixId: "msg_1",
      event: { type: "email.opened", data: {} },
    });
    const handler = registerAndCapture();
    const res = responseSpy();

    await handler({
      body: Buffer.from('{"type":"email.opened","data":{}}'),
      headers: { "svix-signature": "valid", "svix-id": "msg_1", "svix-timestamp": "123" },
    }, res);

    expect(enqueueResendWebhookEvent).toHaveBeenCalledWith({
      svixId: "msg_1",
      event: { type: "email.opened", data: {} },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
