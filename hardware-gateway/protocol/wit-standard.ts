const FRAME_HEADER = 0x55;
const FRAME_LENGTH = 11;

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type WitFrame =
  | { type: 0x51; acceleration: Vector3; temperature: number }
  | { type: 0x52; angularVelocity: Vector3; temperature: number }
  | { type: 0x53; angle: Vector3; version: number }
  | { type: 0x54; magneticField: Vector3; temperature: number }
  | { type: 0x59; quaternion: [number, number, number, number] };

export type WitAttitudeSample = {
  roll: number;
  pitch: number;
  yaw: number;
  q0?: number;
  q1?: number;
  q2?: number;
  q3?: number;
  ax?: number;
  ay?: number;
  az?: number;
  gx?: number;
  gy?: number;
  gz?: number;
  frameTypes: number[];
};

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function checksumIsValid(frame: Buffer) {
  let sum = 0;

  for (let index = 0; index < FRAME_LENGTH - 1; index += 1) {
    sum = (sum + frame[index]) & 0xff;
  }

  return sum === frame[FRAME_LENGTH - 1];
}

function scaledVector(frame: Buffer, scale: number): Vector3 {
  return {
    x: round((frame.readInt16LE(2) / 32768) * scale),
    y: round((frame.readInt16LE(4) / 32768) * scale),
    z: round((frame.readInt16LE(6) / 32768) * scale),
  };
}

export function decodeWitFrame(frame: Buffer): WitFrame | null {
  if (
    frame.length !== FRAME_LENGTH ||
    frame[0] !== FRAME_HEADER ||
    !checksumIsValid(frame)
  ) {
    return null;
  }

  switch (frame[1]) {
    case 0x51:
      return {
        type: 0x51,
        acceleration: scaledVector(frame, 16),
        temperature: round(frame.readInt16LE(8) / 100, 2),
      };
    case 0x52:
      return {
        type: 0x52,
        angularVelocity: scaledVector(frame, 2000),
        temperature: round(frame.readInt16LE(8) / 100, 2),
      };
    case 0x53:
      return {
        type: 0x53,
        angle: scaledVector(frame, 180),
        version: frame.readUInt16LE(8),
      };
    case 0x54:
      return {
        type: 0x54,
        magneticField: {
          x: frame.readInt16LE(2),
          y: frame.readInt16LE(4),
          z: frame.readInt16LE(6),
        },
        temperature: round(frame.readInt16LE(8) / 100, 2),
      };
    case 0x59:
      return {
        type: 0x59,
        quaternion: [
          round(frame.readInt16LE(2) / 32768),
          round(frame.readInt16LE(4) / 32768),
          round(frame.readInt16LE(6) / 32768),
          round(frame.readInt16LE(8) / 32768),
        ],
      };
    default:
      return null;
  }
}

export class WitFrameParser {
  private pending = Buffer.alloc(0);

  push(chunk: Buffer): WitFrame[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const frames: WitFrame[] = [];

    while (this.pending.length >= FRAME_LENGTH) {
      const headerIndex = this.pending.indexOf(FRAME_HEADER);

      if (headerIndex < 0) {
        this.pending = Buffer.alloc(0);
        break;
      }

      if (headerIndex > 0) {
        this.pending = this.pending.subarray(headerIndex);
      }

      if (this.pending.length < FRAME_LENGTH) {
        break;
      }

      const candidate = this.pending.subarray(0, FRAME_LENGTH);
      const decoded = decodeWitFrame(candidate);

      if (decoded) {
        frames.push(decoded);
        this.pending = this.pending.subarray(FRAME_LENGTH);
      } else {
        this.pending = this.pending.subarray(1);
      }
    }

    return frames;
  }
}

export class WitSampleAssembler {
  private values: Omit<WitAttitudeSample, "roll" | "pitch" | "yaw"> &
    Partial<Pick<WitAttitudeSample, "roll" | "pitch" | "yaw">> = {
    frameTypes: [],
  };

  accept(frame: WitFrame): WitAttitudeSample | null {
    if (!this.values.frameTypes.includes(frame.type)) {
      this.values.frameTypes.push(frame.type);
    }

    if (frame.type === 0x51) {
      this.values.ax = frame.acceleration.x;
      this.values.ay = frame.acceleration.y;
      this.values.az = frame.acceleration.z;
    } else if (frame.type === 0x52) {
      this.values.gx = frame.angularVelocity.x;
      this.values.gy = frame.angularVelocity.y;
      this.values.gz = frame.angularVelocity.z;
    } else if (frame.type === 0x53) {
      this.values.roll = frame.angle.x;
      this.values.pitch = frame.angle.y;
      this.values.yaw = frame.angle.z;
    } else if (frame.type === 0x59) {
      [
        this.values.q0,
        this.values.q1,
        this.values.q2,
        this.values.q3,
      ] = frame.quaternion;
    }

    if (
      frame.type !== 0x53 ||
      this.values.roll == null ||
      this.values.pitch == null ||
      this.values.yaw == null
    ) {
      return null;
    }

    return {
      ...this.values,
      roll: this.values.roll,
      pitch: this.values.pitch,
      yaw: this.values.yaw,
      frameTypes: [...this.values.frameTypes],
    };
  }
}
