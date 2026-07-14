import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { hasGatewayApiToken, isDemoMode } from "@/lib/env";

function tokensMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

export function gatewayUnauthorizedResponse(request: Request) {
  if (isDemoMode()) {
    return null;
  }

  const expected = process.env.GATEWAY_API_TOKEN ?? "";
  if (!hasGatewayApiToken()) {
    return NextResponse.json(
      { error: "Gateway authentication is not configured.", code: "GATEWAY_AUTH_NOT_READY" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const actual = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!actual || !tokensMatch(actual, expected)) {
    return NextResponse.json(
      { error: "A valid gateway bearer token is required.", code: "GATEWAY_UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}
