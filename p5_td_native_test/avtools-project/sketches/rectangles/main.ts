import { launch, type TimeContext } from '@avtools/core-timing';
import type { Draw, OnPulse, Setup } from '@avtools/native-webgpu/td-sketch';
import type { ParameterDefinitions } from '@avtools/native-webgpu/td-parameters';

export const parameters = {
  Rectsize: { type: 'xy', default: [80, 40], min: 1, max: 400, clamp: true },
  Rotate: { type: 'pulse', label: 'Rotate Random Rectangle' },
  Rotateduration: { type: 'float', default: 1, min: 0.05, max: 5, clamp: true },
  Rectcolor: { type: 'rgb', default: [1, 0.47, 0.235] },
  Launchfrequency: { type: 'float', default: 2.5, min: 0.1, max: 20, clamp: true }, // launches per second
} as const satisfies ParameterDefinitions;

const MOVE_SPEED = 240; // pixels per second
const TICK = 1 / 60;

type Rectangle = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: readonly [number, number, number];
  rotation: number;
  rotationBranch?: { cancel: () => void };
};

const rectangles = new Map<number, Rectangle>();
let nextId = 0;
let rootCtx: TimeContext | undefined;
let width = 1280;
let height = 720;

export const setup: Setup<typeof parameters> = (p, host) => {
  width = p.width;
  height = p.height;

  const launchRectangle = (ctx: TimeContext) => {
    const { Rectsize, Rectcolor } = host.params;
    const [w, h] = Rectsize;
    // Half-diagonal margin so a rotating rectangle never pops in/out at the edges.
    const margin = Math.hypot(w, h) / 2;
    const id = nextId++;
    const rect: Rectangle = {
      x: -margin,
      y: margin + Math.random() * Math.max(0, height - 2 * margin),
      w,
      h,
      color: Rectcolor,
      rotation: 0,
    };
    rectangles.set(id, rect);

    ctx.branch(async (branchCtx) => {
      while (rect.x < width + margin) {
        await branchCtx.waitSec(TICK);
        rect.x = -margin + MOVE_SPEED * branchCtx.progTime;
      }
      rect.rotationBranch?.cancel();
      rectangles.delete(id);
    }, `rect${id}`);
  };

  const task = launch(async (ctx) => {
    rootCtx = ctx;
    while (true) {
      launchRectangle(ctx);
      await ctx.waitSec(1 / host.params.Launchfrequency);
    }
  });

  task.catch((error) => console.error('Rectangle loop stopped:', error));
  host.onDispose(() => {
    task.cancel();
    rectangles.clear();
    rootCtx = undefined;
  });
};

const launchRotation = (duration: number) => {
  if (!rootCtx || rectangles.size === 0) return;

  const ids = [...rectangles.keys()];
  const id = ids[Math.floor(Math.random() * ids.length)];
  const rect = rectangles.get(id)!;
  rect.rotationBranch?.cancel();

  rect.rotationBranch = rootCtx.branch(async (ctx) => {
    let applied = 0; // fraction of the 360° already added by this branch
    while (applied < 1) {
      await ctx.waitSec(TICK);
      if (!rectangles.has(id)) return;
      const progress = Math.min(ctx.progTime / duration, 1);
      // Additive delta: an interrupted rotation continues from wherever it was.
      rect.rotation += (progress - applied) * Math.PI * 2;
      applied = progress;
    }
  }, `rotate${id}`);
};

export const onPulse: OnPulse<typeof parameters> = (name, _p, frame) => {
  if (name === 'Rotate') launchRotation(frame.params.Rotateduration);
};

export const draw: Draw<typeof parameters> = (p, frame) => {
  width = frame.width;
  height = frame.height;

  p.background(24);
  p.noStroke();
  p.rectMode(p.CENTER);

  for (const rect of rectangles.values()) {
    p.push();
    p.translate(rect.x, rect.y);
    p.rotate(rect.rotation);
    p.fill(rect.color[0] * 255, rect.color[1] * 255, rect.color[2] * 255);
    p.rect(0, 0, rect.w, rect.h);
    p.pop();
  }
};
