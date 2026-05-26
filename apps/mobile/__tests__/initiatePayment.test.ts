/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The mobile api uses the global `fetch` to call the backend. Stub it here
// and import the helper afterwards.
beforeEach(() => {
  vi.resetModules();
  (global as unknown as { fetch: typeof fetch }).fetch = vi.fn() as unknown as typeof fetch;
});

describe("initiatePayment (mobile API helper)", () => {
  it("POSTs to /payments/initiate with the offer id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "pay_1",
        status: "requires_confirmation",
        client_secret: "pi_secret_abc",
        provider: "stripe",
      }),
    });

    const { initiatePayment } = await import("../lib/api");
    const result = await initiatePayment("offer_42");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toContain("/payments/initiate");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body).toEqual({ offer_id: "offer_42", payment_method_id: undefined });
    expect(result.client_secret).toBe("pi_secret_abc");
    expect(result.provider).toBe("stripe");
  });

  it("forwards an optional payment_method_id", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "pay_1", status: "succeeded", provider: "stripe" }),
    });

    const { initiatePayment } = await import("../lib/api");
    await initiatePayment("offer_42", "pm_card_visa");

    const options = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ offer_id: "offer_42", payment_method_id: "pm_card_visa" });
  });

  it("propagates a backend error as a thrown ApiError", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 402,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail: "Card declined" }),
      text: async () => '{"detail":"Card declined"}',
    });

    const { initiatePayment, ApiError } = await import("../lib/api");
    await expect(initiatePayment("offer_42")).rejects.toBeInstanceOf(ApiError);
  });
});
