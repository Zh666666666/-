import type {
  GatewayPlacement,
  QueuedSensorSample,
} from "./types";

type DeviceResponse = {
  id: string;
  serialNo: string;
};

type SessionResponse = {
  id: string;
};

export class GatewayApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  private async request<Response>(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Gateway API ${init.method ?? "GET"} ${path} failed (${response.status}): ${detail}`,
      );
    }

    return response.json() as Promise<Response>;
  }

  async provisionDevice(input: {
    serialNo: string;
    placement: GatewayPlacement;
    patientId: string;
  }) {
    const device = await this.request<DeviceResponse>("/api/devices", {
      method: "POST",
      body: JSON.stringify({
        serialNo: input.serialNo,
        name: `WT9011DCL-BT50 ${input.placement === "THIGH" ? "Thigh" : "Shank"}`,
        model: "WT9011DCL-BT50",
        manufacturer: "WitMotion",
      }),
    });

    const bindings = await this.request<
      Array<{ deviceId: string; placement: GatewayPlacement; active: boolean }>
    >(`/api/device-bindings?patientId=${encodeURIComponent(input.patientId)}`);
    const alreadyBound = bindings.some(
      (binding) =>
        binding.active &&
        binding.deviceId === device.id &&
        binding.placement === input.placement,
    );

    if (!alreadyBound) {
      await this.request("/api/device-bindings", {
        method: "POST",
        body: JSON.stringify({
          deviceId: device.id,
          patientId: input.patientId,
          placement: input.placement,
        }),
      });
    }

    return device.id;
  }

  async startSession(patientId: string) {
    const session = await this.request<SessionResponse>("/api/sensor-sessions", {
      method: "POST",
      body: JSON.stringify({ patientId, source: "HARDWARE" }),
    });
    return session.id;
  }

  async finishSession(sessionId: string, aborted = false) {
    await this.request(`/api/sensor-sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: aborted ? "ABORTED" : "COMPLETED" }),
    });
  }

  async uploadSample(
    sample: QueuedSensorSample,
    deviceId: string,
    sessionId: string,
  ) {
    await this.request("/api/sensor-samples", {
      method: "POST",
      body: JSON.stringify({
        ...sample,
        deviceId,
        sessionId,
      }),
    });
  }
}
