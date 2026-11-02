import type {Setup, Draw} from '@avtools/native-webgpu/td-sketch';
import type {ParameterDefinitions} from '@avtools/native-webgpu/td-parameters';
import {
  bakeDrawingDocument, createEmptyDrawingDocument, sampleCurveSegments,
  type FlattenedStrokeGroup, type FlattenedStroke, type DrawingDocument, type DrawingNode,
} from '@avtools/drawing-document';
import {subscribeDrawing} from './subscribe.ts';

export const parameters = {
  Server: {type: 'string', label: 'Drawing URL', default: 'ws://127.0.0.1:5177/canvas?drawing=main'},
  Weight: {type: 'float', label: 'Line Weight', default: 3, min: 0.5, max: 16},
  Runnersize: {type: 'float', label: 'Runner Size', default: 18, min: 2, max: 80},
  Runnerspeed: {type: 'float', label: 'Runner Speed (px/s)', default: 150, min: 0, max: 1000},
} as const satisfies ParameterDefinitions;

type Point = {x: number; y: number};
type RunnerKind = 'square' | 'circle' | 'triangle';

/** A runner shape traveling along a precomputed perimeter path. */
interface Runner {
  kind: RunnerKind;
  points: Point[];
  /** Cumulative arc length at each point; last entry is total length. */
  lengths: number[];
  closed: boolean;
}

let drawing = bakeDrawingDocument(createEmptyDrawingDocument());
let polygons: Array<Array<{x: number; y: number}>> = [];
let runners: Runner[] = [];
// Accumulated distance traveled (px). Integrated from deltaSeconds so speed
// changes don't make runners jump.
let distance = 0;

function parseRunner(metadata: Record<string, unknown> | undefined): RunnerKind | undefined {
  const value = metadata?.runner;
  if (typeof value !== 'string') return undefined;
  const kind = value.trim().toLowerCase();
  return kind === 'square' || kind === 'circle' || kind === 'triangle' ? kind : undefined;
}

/** Walk the raw document so a group's `runner` applies to its children
 * (the baked circle layer drops group metadata). Child metadata wins. */
function collectRunnerInfo(document: DrawingDocument) {
  const kinds = new Map<string, RunnerKind>();
  const closed = new Map<string, boolean>();
  const visit = (node: DrawingNode, inherited: RunnerKind | undefined) => {
    const kind = parseRunner(node.metadata) ?? inherited;
    if (node.type === 'group') { for (const child of node.children) visit(child, kind); return; }
    if (kind) kinds.set(node.id, kind);
    if (node.type === 'polygon') closed.set(node.id, node.closed);
  };
  for (const layer of [document.freehand, document.polygon, document.circle]) {
    for (const node of layer.nodes) visit(node, undefined);
  }
  return {kinds, closed};
}

function makeRunner(kind: RunnerKind, points: Point[], closed: boolean): Runner | undefined {
  if (points.length < 2) return undefined;
  const path = closed ? [...points, points[0]] : points;
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  if (lengths[lengths.length - 1] <= 0) return undefined;
  return {kind, points: path, lengths, closed};
}

function ellipsePoints(c: {center: Point; rx: number; ry: number; rotation: number}, count = 96): Point[] {
  const cos = Math.cos(c.rotation), sin = Math.sin(c.rotation);
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.cos(a) * c.rx, y = Math.sin(a) * c.ry;
    points.push({x: c.center.x + x * cos - y * sin, y: c.center.y + x * sin + y * cos});
  }
  return points;
}

function strokeLeaves(shape: FlattenedStroke | FlattenedStrokeGroup, out: FlattenedStroke[] = []) {
  if (shape.type === 'stroke') out.push(shape);
  else for (const child of shape.children) strokeLeaves(child, out);
  return out;
}

function buildRunners(document: DrawingDocument): Runner[] {
  const {kinds, closed} = collectRunnerInfo(document);
  const result: Runner[] = [];
  const add = (runner: Runner | undefined) => { if (runner) result.push(runner); };

  drawing.polygon.forEach((shape, i) => {
    const kind = kinds.get(shape.id);
    if (kind) add(makeRunner(kind, polygons[i], closed.get(shape.id) ?? true));
  });
  for (const circle of drawing.circle) {
    const kind = kinds.get(circle.id);
    if (kind) add(makeRunner(kind, ellipsePoints(circle), true));
  }
  for (const group of drawing.freehand) {
    for (const stroke of strokeLeaves(group)) {
      const kind = kinds.get(stroke.id);
      if (kind) add(makeRunner(kind, stroke.points, false));
    }
  }
  return result;
}

/** Position and tangent angle at arc length `d`. Closed paths loop; open
 * paths (strokes, open polygons) ping-pong between their ends. */
function sample(runner: Runner, d: number): {x: number; y: number; angle: number} {
  const total = runner.lengths[runner.lengths.length - 1];
  let s: number;
  if (runner.closed) {
    s = ((d % total) + total) % total;
  } else {
    const t = ((d % (2 * total)) + 2 * total) % (2 * total);
    s = t <= total ? t : 2 * total - t;
  }
  // Binary search for the segment containing s.
  let lo = 0, hi = runner.lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (runner.lengths[mid] <= s) lo = mid; else hi = mid;
  }
  const a = runner.points[lo], b = runner.points[hi];
  const span = runner.lengths[hi] - runner.lengths[lo];
  const u = span > 0 ? (s - runner.lengths[lo]) / span : 0;
  return {x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, angle: Math.atan2(b.y - a.y, b.x - a.x)};
}

export const setup: Setup<typeof parameters> = (_p, host) => {
  // Changing Server requires Reset. A disconnect preserves the last drawing.
  subscribeDrawing(host, host.params.Server, document => {
    drawing = bakeDrawingDocument(document);
    // Curve sampling and runner paths belong to the edit callback, not every rendered frame.
    polygons = drawing.polygon.map(shape => shape.segments
      ? sampleCurveSegments(shape.segments) : shape.points);
    runners = buildRunners(document);
  }, status => console.log('Canvas:', status));
};

export const draw: Draw<typeof parameters> = (p, frame) => {
  const {Weight, Runnersize, Runnerspeed} = frame.params;
  distance += frame.deltaSeconds * Runnerspeed;

  p.background(20, 28, 35);
  p.push();
  p.scale(frame.width / 1280, frame.height / 720);
  p.noFill();
  p.stroke(96, 215, 180);
  p.strokeWeight(Weight);

  function stroke(shape: FlattenedStroke | FlattenedStrokeGroup) {
    if (shape.type === 'strokeGroup') { for (const child of shape.children) stroke(child); return; }
    p.beginShape();
    for (const point of shape.points) p.vertex(point.x, point.y);
    p.endShape();
  }
  for (const group of drawing.freehand) stroke(group);
  for (const points of polygons) {
    p.beginShape();
    for (const point of points) p.vertex(point.x, point.y);
    p.endShape(p.CLOSE);
  }
  for (const circle of drawing.circle) {
    p.push();
    p.translate(circle.center.x, circle.center.y);
    p.rotate(circle.rotation);
    p.ellipse(0, 0, circle.rx * 2, circle.ry * 2);
    p.pop();
  }

  // Runners: filled shapes riding the perimeter, oriented along the path.
  p.noStroke();
  p.fill(255, 200, 80);
  p.rectMode(p.CENTER);
  const r = Runnersize / 2;
  for (const runner of runners) {
    const {x, y, angle} = sample(runner, distance);
    p.push();
    p.translate(x, y);
    p.rotate(angle);
    if (runner.kind === 'square') p.square(0, 0, Runnersize);
    else if (runner.kind === 'circle') p.circle(0, 0, Runnersize);
    else p.triangle(r, 0, -r * 0.8, -r * 0.8, -r * 0.8, r * 0.8);
    p.pop();
  }
  p.pop();
};
