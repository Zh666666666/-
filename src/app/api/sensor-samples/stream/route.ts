import { subscribeSensorLiveEvents } from "@/lib/sensor-live-broker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patientId");
  if (!patientId) {
    return Response.json({ error: "patientId is required" }, { status: 400 });
  }

  let close: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("ready", { patientId, connectedAt: new Date().toISOString() });

      const unsubscribe = subscribeSensorLiveEvents((event) => {
        if (event.patientId === patientId) send("sample", event);
      });
      const heartbeat = setInterval(() => send("heartbeat", { at: new Date().toISOString() }), 15_000);
      let closed = false;
      close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });
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
