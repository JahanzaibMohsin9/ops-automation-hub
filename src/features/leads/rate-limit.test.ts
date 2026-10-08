import { extractClientIpAddress } from "@/features/leads/rate-limit";

describe("lead form rate limiting helpers", () => {
  it("prefers the first forwarded IP address", () => {
    const requestHeaders = new Headers({
      "x-forwarded-for": "198.51.100.10, 203.0.113.9",
      "x-real-ip": "203.0.113.5",
    });

    expect(extractClientIpAddress(requestHeaders)).toBe("198.51.100.10");
  });

  it("falls back to x-real-ip and cloudflare headers", () => {
    expect(
      extractClientIpAddress(
        new Headers({
          "x-real-ip": "203.0.113.5",
        })
      )
    ).toBe("203.0.113.5");

    expect(
      extractClientIpAddress(
        new Headers({
          "cf-connecting-ip": "2001:db8::10",
        })
      )
    ).toBe("2001:db8::10");
  });

  it("returns null when no IP header is available", () => {
    expect(extractClientIpAddress(new Headers())).toBeNull();
  });
});
