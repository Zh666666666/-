import { subscribeSensorLiveEvents } from "@/lib/sensor-live-broker";
import { requestCanAccessPatient } from "@/lib/server-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId");
  if (!patientId) {
    return Response.json({ error: "patientId is required" }, { status: 400 });
  }

  if (!await requestCanAccessPatient(request, patientId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let close: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("ready", { patientId, connectedAt: new Date().toISOString() });

      const unsubscribe = subscribeSensorLiveEvents((event) => {
        if (event.patientId === patientId) send("sample", event);
      });
      const heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);
      // Bound authorization lifetime: reconnect rechecks account and patient scope.
      const expiry = setTimeout(() => close?.(), 60_000);
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(expiry);
        unsubscribe();
        request.signal.removeEventListener("abort", close!);
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) close();
    },
    cancel() {
      close?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
