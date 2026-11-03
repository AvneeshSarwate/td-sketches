import type { Draw, OnPulse } from '@avtools/native-webgpu/td-sketch';
import type { ParameterDefinitions } from '@avtools/native-webgpu/td-parameters';

// Pulse Launchcircle to spawn a circle that does one loop around the screen
// center at Movementradius. Color, radius, direction and launch phase are
// captured at launch time, so changing them only affects later circles.
export const parameters = {
  Launchcircle: { type: 'pulse', label: 'Launch Circle' },
  Circlecolor: { type: 'rgb', default: [1, 0.47, 0.235], label: 'Circle Color' },
  Circleradius: { type: 'float', default: 40, min: 1, max: 300, clamp: true, label: 'Circle Radius' },
  Movementradius: { type: 'float', default: 250, min: 0, max: 1000, label: 'Movement Radius' },
  Loopduration: { type: 'float', default: 3, min: 0.1, max: 20, clamp: true, label: 'Loop Duration (s)' },
  Direction: { type: 'menu', options: ['cw', 'ccw'], labels: ['Clockwise', 'Counter-clockwise'], label: 'Direction' },
  Launchphase: { type: 'float', default: 0, min: 0, max: 360, label: 'Launch Phase (deg)' },
} as const satisfies ParameterDefinitions;

interface Circle {
  color: readonly [number, number, number];
  radius: number;
  movementRadius: number;
  duration: number;
  direction: 1 | -1; // 1 = clockwise on screen (p5 y-down), -1 = counter-clockwise
  startAngle: number; // radians, screen space
  age: number;
}

const circles: Circle[] = [];

export const onPulse: OnPulse<typeof parameters> = (name, _p, frame) => {
  if (name !== 'Launchcircle') return;
  const { Circlecolor, Circleradius, Movementradius, Loopduration, Direction, Launchphase } = frame.params;
  circles.push({
    color: [Circlecolor[0], Circlecolor[1], Circlecolor[2]],
    radius: Circleradius,
    movementRadius: Movementradius,
    duration: Loopduration,
    direction: Direction === 'ccw' ? -1 : 1,
    // Launch phase is degrees clockwise from 12 o'clock.
    startAngle: -Math.PI / 2 + (Launchphase * Math.PI) / 180,
    age: 0,
  });
};

export const draw: Draw<typeof parameters> = (p, frame) => {
  p.clear(); // transparent background so the circle can be composited "over"
  p.noStroke();

  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const dt = Math.max(0, frame.deltaSeconds);

  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    c.age += dt;
    if (c.age >= c.duration) {
      circles.splice(i, 1);
      continue;
    }
    // One full revolution from the launch angle, in the captured direction.
    const angle = c.startAngle + c.direction * (c.age / c.duration) * Math.PI * 2;
    p.fill(c.color[0] * 255, c.color[1] * 255, c.color[2] * 255);
    p.circle(cx + Math.cos(angle) * c.movementRadius, cy + Math.sin(angle) * c.movementRadius, c.radius * 2);
  }
};
