import { launch, type TimeContext } from '@avtools/core-timing';
import type { Draw, OnPulse, Setup } from '@avtools/native-webgpu/td-sketch';
import type { ParameterDefinitions } from '@avtools/native-webgpu/td-parameters';

export const parameters = {
  Rectsize: { type: 'xy', default: [80, 40], min: 1, max: 400, clamp: true },
  Rotate: { type: 'pulse', label: 'Rotate Random Rectangle' },
  Rotateduration: { type: 'float', default: 1, min: 0.05, max: 5, clamp: true },
  Rectcolor: { type: 'rgb', default: [1, 0.47, 0.235] },
  Launchfrequency: { type: 'float', default: 2.5, min: 0.1, max: 20, clamp: true }, // launches per second
  Righttoleft: { type: 'toggle', default: false, label: 'Right to Left' },
  Speed: { type: 'float', default: 240, min: 10, max: 1000, clamp: true }, // pixels per second
  Counterclockwise: { type: 'toggle', default: false },
} as const satisfies ParameterDefinitions;

// Motion and rotation are pure functions of wall-clock time, evaluated once per
// draw with a single `now`. Per-rectangle timers would tick out of phase with
// TD frames and with each other, which shows up as relative x jitter.
type Rectangle = {
  startX: number;
  direction: 1 | -1; // snapshotted at launch so toggling doesn't move existing rectangles
  speed: number; // pixels per second, snapshotted at launch
  launchedAt: number; // performance.now() ms
  y: number;
  w: number;
  h: number;
  color: readonly [number, number, number];
  baseRotation: number; // radians accumulated before the current spin
  spinStart: number; // performance.now() ms; NaN when no spin has started
  spinDuration: number; // seconds, snapshotted at pulse time
  spinDirection: 1 | -1; // 1 = clockwise on screen (y-down), snapshotted at pulse time
};

const rectangles = new Map<number, Rectangle>();
let nextId = 0;
let width = 1280;
let height = 720;

const xAt = (rect: Rectangle, now: number) =>
  rect.startX + (rect.direction * rect.speed * (now - rect.launchedAt)) / 1000;

const rotationAt = (rect: Rectangle, now: number) => {
  if (Number.isNaN(rect.spinStart)) return rect.baseRotation;
  const progress = Math.min((now - rect.spinStart) / 1000 / rect.spinDuration, 1);
  return rect.baseRotation + rect.spinDirection * progress * Math.PI * 2;
};

export const setup: Setup<typeof parameters> = (p, host) => {
  width = p.width;
  height = p.height;

  const launchRectangle = (ctx: TimeContext) => {
    const { Rectsize, Rectcolor, Righttoleft, Speed } = host.params;
    const [w, h] = Rectsize;
    // Half-diagonal margin so a rotating rectangle never pops in/out at the edges.
    const margin = Math.hypot(w, h) / 2;
    const id = nextId++;
    rectangles.set(id, {
      startX: Righttoleft ? width + margin : -margin,
      direction: Righttoleft ? -1 : 1,
      speed: Speed,
      launchedAt: performance.now(),
      y: margin + Math.random() * Math.max(0, height - 2 * margin),
      w,
      h,
      color: Rectcolor,
      baseRotation: 0,
      spinStart: NaN,
      spinDuration: 1,
      spinDirection: 1,
    });

    // The branch only handles lifetime: remove the rectangle once it has crossed the screen.
    ctx.branch(async (branchCtx) => {
      await branchCtx.waitSec((width + 2 * margin) / Speed);
      rectangles.delete(id);
    }, `rect${id}`);
  };

  const task = launch(async (ctx) => {
    while (true) {
      launchRectangle(ctx);
      await ctx.waitSec(1 / host.params.Launchfrequency);
    }
  });

  task.catch((error) => console.error('Rectangle loop stopped:', error));
  host.onDispose(() => {
    task.cancel();
    rectangles.clear();
  });
};

const launchRotation = (duration: number, counterclockwise: boolean) => {
  if (rectangles.size === 0) return;

  const ids = [...rectangles.keys()];
  const rect = rectangles.get(ids[Math.floor(Math.random() * ids.length)])!;
  const now = performance.now();
  // Fold the interrupted spin into the base so the new one continues from the current angle.
  rect.baseRotation = rotationAt(rect, now);
  rect.spinStart = now;
  rect.spinDuration = duration;
  rect.spinDirection = counterclockwise ? -1 : 1;
};

export const onPulse: OnPulse<typeof parameters> = (name, _p, frame) => {
  if (name === 'Rotate') launchRotation(frame.params.Rotateduration, frame.params.Counterclockwise);
};

export const draw: Draw<typeof parameters> = (p, frame) => {
  width = frame.width;
  height = frame.height;
  const now = performance.now();

  p.clear();
  p.noStroke();
  p.rectMode(p.CENTER);

  for (const rect of rectangles.values()) {
    p.push();
    p.translate(xAt(rect, now), rect.y);
    p.rotate(rotationAt(rect, now));
    p.fill(rect.color[0] * 255, rect.color[1] * 255, rect.color[2] * 255);
    p.rect(0, 0, rect.w, rect.h);
    p.pop();
  }
};
