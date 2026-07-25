import { NextResponse } from "next/server";
import { z } from "zod";

import { POST as ingestOne } from "../route";

const batchSchema = z.object({
  samples: z.array(z.unknown()).min(1).max(100),
});

export async function POST(request: Request) {
  const parsed = batchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sensor sample batch", issues: parsed.error.flatten() }, { status: 400 });
  }

  const authorization = request.headers.get("authorization");
  const results: Array<{ status: number; body: unknown }> = [];
  const concurrency = 6;

  for (let start = 0; start < parsed.data.samples.length; start += concurrency) {
    const chunk = parsed.data.samples.slice(start, start + concurrency);
    const chunkResults = await Promise.all(chunk.map(async (sample) => {
      const response = await ingestOne(new Request(new URL("/api/sensor-samples", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify(sample),
      }));
      return { status: response.status, body: await response.json() };
    }));
    results.push(...chunkResults);
  }

  return NextResponse.json({
    accepted: results.filter((result) => result.status >= 200 && result.status < 300).length,
    results,
  });
}
