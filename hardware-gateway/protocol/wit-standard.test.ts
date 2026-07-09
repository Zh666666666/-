import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeWitFrame,
  WitFrameParser,
  WitSampleAssembler,
} from "./wit-standard";

function createFrame(type: number, values: [number, number, number, number]) {
  const frame = Buffer.alloc(11);
  frame[0] = 0x55;
  frame[1] = type;
  values.forEach((value, index) => frame.writeInt16LE(value, 2 + index * 2));
  frame[10] = frame
    .subarray(0, 10)
    .reduce((sum, value) => (sum + value) & 0xff, 0);
  return frame;
}

test("decodes a WIT angle frame", () => {
  const frame = createFrame(0x53, [16384, -8192, 4096, 7]);
  const decoded = decodeWitFrame(frame);

  assert.deepEqual(decoded, {
    type: 0x53,
    angle: { x: 90, y: -45, z: 22.5 },
    version: 7,
  });
});

test("parses fragmented frames and resynchronizes after invalid bytes", () => {
  const acceleration = createFrame(0x51, [2048, 0, -2048, 2500]);
  const angle = createFrame(0x53, [0, 16384, 0, 1]);
  const invalid = Buffer.from(angle);
  invalid[10] ^= 0xff;

  const parser = new WitFrameParser();
  assert.equal(parser.push(acceleration.subarray(0, 5)).length, 0);

  const first = parser.push(
    Buffer.concat([acceleration.subarray(5), Buffer.from([0x01]), invalid]),
  );
  assert.equal(first.length, 1);
  assert.equal(first[0].type, 0x51);

  const second = parser.push(angle);
  assert.equal(second.length, 1);
  assert.equal(second[0].type, 0x53);
});

test("assembles acceleration, gyroscope and angle into one sample", () => {
  const parser = new WitFrameParser();
  const assembler = new WitSampleAssembler();
  const frames = parser.push(
    Buffer.concat([
      createFrame(0x51, [2048, 0, -2048, 2500]),
      createFrame(0x52, [1638, 0, -1638, 2500]),
      createFrame(0x53, [0, 16384, 0, 1]),
    ]),
  );

  const samples = frames
    .map((frame) => assembler.accept(frame))
    .filter((sample) => sample !== null);

  assert.equal(samples.length, 1);
  assert.equal(samples[0].pitch, 90);
  assert.equal(samples[0].ax, 1);
  assert.equal(samples[0].gz, -99.975586);
  assert.deepEqual(samples[0].frameTypes, [0x51, 0x52, 0x53]);
});
