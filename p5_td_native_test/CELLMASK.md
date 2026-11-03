# cellmask: per-cell rectangular cut-out mask (work in progress)

Status as of 2026-11-01: implemented and numerically checked against a numpy
reference, but **not yet producing the intended look**. This doc covers the
goal, the current design, what has been verified, and the open questions.

The network lives at `/project1/cellmask` in `p5_td.1.toe`, with `null1` as its
input. All shader source is in DATs inside that COMP and is copied in the
appendix below, in case the `.toe` was not saved.

## Goal

Take an input image and a grid resolution. For each grid cell, find an X and Y
split. The kept region is the pixels to one side of X **or** one side of Y,
which forms an L shape. The opposite corner rectangle is cut out (masked to 0).
X and Y are chosen so the kept L region is at least `Fillratio` filled, where a
pixel counts as filled when its alpha is above 0.

```
cell (cut anchored at the top-right corner, for example)
┌───────────┬──────┐
│   kept    │ CUT  │
├──────────Y┼──────┤
│   kept    │ kept │
└───────────X──────┘
```

- All four corners are tried per cell, and the best one is used.
- Objective: **keep as much as possible**, which means the smallest cut whose
  remaining L is at least `Fillratio` filled. Maximizing the cut instead would
  collapse toward an empty L, because a tiny region near a corner is trivially
  dense.
- A cell that is already at least `Fillratio` filled gets no cut.
- A cell where no corner cut works, such as an empty cell, is cut entirely.
- The output is the mask only. It is applied to the image separately (multiply
  or Matte TOP).

Later requirements:
- **Min width:** no thin slivers. The cut rectangle and each kept strip must be
  either zero or at least `Minwidth` px.
- **Temporal stability:** flicker should be suppressed. The idea is a feedback
  loop on the per-cell parameters that eases toward a target, plus hysteresis
  so the target itself does not flip-flop.

## Controls (custom page "Cellmask" on the COMP)

| Parameter | Last value | Meaning |
|---|---|---|
| `Gridcols`, `Gridrows` | 16, 9 | Grid resolution |
| `Fillratio` | 0.65 (default 0.8) | Required fill of the kept L |
| `Minwidth` | 8 | Minimum px width of the cut and of each nonzero kept strip |
| `Hysteresis` | 0.05 | Keep last frame's cut unless the new best cut is smaller by more than this fraction of the cell area |
| `Smoothing` | 0.8 | Per-frame easing of the displayed rectangle: `mix(target, prev, Smoothing)`. 0 = off |

All of these are passed to every GLSL TOP as uniforms (`uGrid`, `uRatio`,
`uMinWidth`, `uHysteresis`, `uSmoothing`) through the Vectors page, as
expressions on `parent.Cellmask.par.*`.

## Pipeline

All stages are GLSL TOP pixel shaders. Texture space has y pointing up.

```
in1 ─▶ glsl_rowsum ─▶ glsl_colsum ─▶ glsl_candidates ─▶ glsl_params ─▶ null_target ─▶ glsl_smooth ─▶ null_smooth ─▶ glsl_mask ─▶ out1
 │      full res       full res        full res           grid res        ▲   │            grid res        ▲   │          full res
 │      mono32f        mono32f (SAT)   rg32f              rgba32f         │   │            rgba32f         │   │          mono8
 │                         └──────────────────────────────▶ (in 1)        │   ▼                            │   ▼
 │                                     constant_init ─▶ feedback_target ──┘ (in 2)    constant_init ─▶ feedback_smooth (in 1)
 └──────────────────────────────────────────────────────────────────────────────────────▶ glsl_smooth (in 2, resolution only)
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────▶ glsl_mask (in 0)
```

1. **`glsl_rowsum`:** running count of filled pixels along each row, restarting
   at each cell's left edge.
2. **`glsl_colsum`:** running sum of the row sums up each column, restarting at
   each cell's bottom edge. The result is a summed-area table (SAT) **local to
   each cell**, so S(u, v) is the filled count in [0..u]×[0..v] of the cell.
   Local tables keep the values exact in float32.
3. **`glsl_candidates`:** every pixel (u, v) is the inner corner of four
   candidate cut rectangles, one anchored at each cell corner. For each, it
   computes kept fill = (total − cut sum) / (area − cut area) using the SAT, and
   checks the min-width rule. Output: r = smallest valid cut area (1e30 if none),
   g = corner index (−1 if none). Corners are 0 = (0,0), 1 = (W,0), 2 = (0,H),
   3 = (W,H).
4. **`glsl_params`:** one texel per cell.
   - If the cell is already dense enough, output an empty rectangle.
   - Otherwise, loop over the cell's candidates and take the smallest valid cut.
   - With no valid cut, output the whole cell.
   - **Hysteresis:** read last frame's target from `feedback_target`. If it is
     still valid under the current SAT (anchored at a corner, widths OK, fill OK)
     and the new best is not smaller by more than `Hysteresis × area`, keep it.
   - Output: cut rectangle in cell-local pixels (x0, y0, x1, y1), with the end
     values exclusive. Empty = all zeros.
5. **`glsl_smooth`:** eases the displayed rectangle toward the target, reading
   last frame's value from `feedback_smooth`.
   - An empty rectangle is first collapsed to a zero-size rectangle at the other
     rectangle's anchored corner, so cuts grow out of and shrink into their
     corner.
   - It snaps to the target when within 0.05 px.
6. **`glsl_mask`:** each pixel looks up its cell's smoothed rectangle and outputs
   0 inside it and 1 elsewhere.

Cell tiling: pixel x belongs to cell `floor(x * cols / W)`, and cell i starts at
`ceil(i * W / cols)`. When the resolution is not divisible by the grid, cells
differ by 1 px but still tile exactly.

Both feedback loops are seeded by `constant_init`, a zero-filled rgba32float
constant at grid resolution.

## Verified

- **Before min width and stabilization were added:** on a live frame, every one
  of the 144 cells matched a brute-force numpy search for the smallest valid cut
  area. The mask matched each rectangle exactly, and every kept region met the
  ratio.
- **After:** every target rectangle on a live frame was anchored at a corner,
  respected `Minwidth`, and met `Fillratio`.
- **Flicker, measured over 60 frames on the live input:**
  - Target rectangles changing per frame: 12.8 cells with no hysteresis, 8.3 at
    0.05. Most of the remaining change is real motion in the input.
  - Cells whose cut area jumped by more than 25% of the cell in one frame: 0.37
    per frame with no hysteresis, 0.12 at 0.05, and **0** after smoothing.
- No shader compile errors.

## Known issues and open questions

The user's last feedback was "close, but still not exactly right", with nothing
more specific yet. Candidates to look at:

- **Thin strips across cells:** min width is enforced per cell only. Two
  adjacent cells can each leave a legal strip that together reads as a thin
  line, or a cut can end right at a cell edge next to a neighbor's strip.
- **Whole-cell fallback:** sparse or scattered cells where no single corner cut
  reaches the ratio are blacked out entirely. That may be too aggressive.
  Alternatives: keep them uncut, or take the best cut even if it misses the
  ratio.
- **Objective:** the cut is the smallest one that reaches the ratio. A larger cut
  that leaves a denser result is never chosen. Should the objective weigh
  density as well as kept area?
- **Corner switching while smoothing:** the eased rectangle slides across the
  cell when the target moves to a different corner. A shrink-then-grow
  transition might look better.
- **Fill during easing:** the eased rectangle does not always meet the fill
  ratio mid-transition.
- **Frame-dependent smoothing:** the easing is per frame, so its speed depends on
  the frame rate.
- **Tie-breaks:** among equal-area cuts, the first found wins, which matters for
  symmetric shapes. Hysteresis mostly hides this.
- **Hysteresis threshold:** it is relative to the cell area, so small cells are
  stickier in absolute pixels than large ones.
- **Cost:** not measured, because TD reported 0 ms GPU cook times, probably
  because GPU timing is off. The row and column passes read about one cell
  width per pixel, and `glsl_params` loops over a whole cell per texel. Large
  cells (a coarse grid) are the slow case. Compute shaders with shared-memory
  prefix sums and a parallel reduction would fix it.
- **Shader source:** the shaders live only in DATs inside the `.toe`. Consider
  syncing them to files (TD's File parameter on each DAT) so they are versioned
  in git.

## Appendix: shader source

Each stage's DAT is the shared header followed by its body. Stages marked
"+ SAT" also include the SAT helpers after the header.

### Shared header (top of every shader)

```glsl
uniform vec2 uGrid;        // columns, rows
uniform float uRatio;      // required fill ratio of the kept L region
uniform float uMinWidth;   // min pixel width of each kept strip and of the cut
uniform float uHysteresis; // fraction of cell area a new cut must improve by to replace the previous one

// Cell c covers [cellStart(c), cellStart(c + 1)) so cells tile exactly when
// the resolution isn't divisible by the grid.
ivec2 gridI() { return max(ivec2(uGrid), ivec2(1)); }
ivec2 cellOf(ivec2 p, ivec2 res) { return (p * gridI()) / res; }
ivec2 cellStart(ivec2 c, ivec2 res) { ivec2 g = gridI(); return (c * res + g - 1) / g; }

// A cut of size cw x ch in a W x H cell: the cut and both kept strips must be
// zero or at least uMinWidth wide.
bool widthsOk(int cw, int ch, int W, int H) {
    int m = int(uMinWidth);
    int armX = W - cw, armY = H - ch;
    return cw >= m && ch >= m && (armX == 0 || armX >= m) && (armY == 0 || armY >= m);
}
```

### SAT helpers (`pixel_candidates`, `pixel_params`)

```glsl
// Per-cell summed-area table, local to each cell (S(u, v) = filled count in
// [0..u] x [0..v] of the cell), so values stay exact in 32-bit float.
float S(sampler2D sat, ivec2 cs, int u, int v) {
    if (u < 0 || v < 0) return 0.0;
    return texelFetch(sat, cs + ivec2(u, v), 0).r;
}
// Filled count of local inclusive rect [x0..x1] x [y0..y1].
float rectSum(sampler2D sat, ivec2 cs, int x0, int y0, int x1, int y1) {
    return S(sat, cs, x1, y1) - S(sat, cs, x0 - 1, y1) - S(sat, cs, x1, y0 - 1) + S(sat, cs, x0 - 1, y0 - 1);
}
```

### `pixel_rowsum` → `glsl_rowsum` (mono32float)

```glsl
// Stage 1a: running count of filled (alpha > 0) pixels along each row, restarting at each cell's left edge.
out vec4 fragColor;
void main() {
    ivec2 res = ivec2(uTD2DInfos[0].res.zw);
    ivec2 p = ivec2(gl_FragCoord.xy);
    int x0 = cellStart(cellOf(p, res), res).x;
    float sum = 0.0;
    for (int x = x0; x <= p.x; x++)
        sum += texelFetch(sTD2DInputs[0], ivec2(x, p.y), 0).a > 0.0 ? 1.0 : 0.0;
    fragColor = TDOutputSwizzle(vec4(sum));
}
```

### `pixel_colsum` → `glsl_colsum` (mono32float)

```glsl
// Stage 1b: running sum of the row sums down each column, restarting at each cell's bottom edge.
out vec4 fragColor;
void main() {
    ivec2 res = ivec2(uTD2DInfos[0].res.zw);
    ivec2 p = ivec2(gl_FragCoord.xy);
    int y0 = cellStart(cellOf(p, res), res).y;
    float sum = 0.0;
    for (int y = y0; y <= p.y; y++)
        sum += texelFetch(sTD2DInputs[0], ivec2(p.x, y), 0).r;
    fragColor = TDOutputSwizzle(vec4(sum));
}
```

### `pixel_candidates` → `glsl_candidates` (rg32float, + SAT)

```glsl
// Stage 2a: each pixel is the inner corner of four candidate cut rectangles, one
// anchored at each cell corner. Output the smallest valid cut area and its corner.
// Corners (texture space, y up): 0 = (0,0), 1 = (W,0), 2 = (0,H), 3 = (W,H).
out vec4 fragColor;
void main() {
    ivec2 res = ivec2(uTD2DInfos[0].res.zw);
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 c = cellOf(p, res);
    ivec2 cs = cellStart(c, res);
    ivec2 size = cellStart(c + 1, res) - cs;
    int W = size.x, H = size.y, u = p.x - cs.x, v = p.y - cs.y;
    float area = float(W * H);
    float total = S(sTD2DInputs[0], cs, W - 1, H - 1);

    ivec4 rects[4] = ivec4[4](
        ivec4(0, 0, u, v),
        ivec4(u, 0, W - 1, v),
        ivec4(0, v, u, H - 1),
        ivec4(u, v, W - 1, H - 1));

    float best = 1e30;
    float corner = -1.0;
    for (int k = 0; k < 4; k++) {
        ivec4 r = rects[k];
        int cw = r.z - r.x + 1, ch = r.w - r.y + 1;
        float cutArea = float(cw * ch);
        float keptArea = area - cutArea;
        if (keptArea <= 0.0 || !widthsOk(cw, ch, W, H)) continue;
        float keptFilled = total - rectSum(sTD2DInputs[0], cs, r.x, r.y, r.z, r.w);
        if (keptFilled >= uRatio * keptArea && cutArea < best) {
            best = cutArea;
            corner = float(k);
        }
    }
    fragColor = TDOutputSwizzle(vec4(best, corner, 0.0, 1.0));
}
```

### `pixel_params` → `glsl_params` (rgba32float, grid res, + SAT)

Inputs: 0 = `glsl_candidates`, 1 = `glsl_colsum`, 2 = `feedback_target`.

```glsl
// Stage 2b: one texel per cell. Reduce the candidates to the smallest valid cut
// and output it as a local pixel rect (x0, y0, x1, y1), end-exclusive.
// No cut needed -> empty rect. No valid cut (e.g. empty cell) -> whole cell.
// The previous frame's rect is kept while still valid unless the new one is
// smaller by more than uHysteresis * cell area.
// Input 0: candidates, input 1: SAT, input 2: previous frame's output.
out vec4 fragColor;

// Cut area of rect r if it's a valid choice for this cell, else -1.
float validCost(ivec4 r, ivec2 cs, int W, int H, float total) {
    float area = float(W * H);
    int cw = r.z - r.x, ch = r.w - r.y;
    if (r.x < 0 || r.y < 0 || r.z > W || r.w > H || cw < 0 || ch < 0) return -1.0;
    if (cw == 0 || ch == 0) return total >= uRatio * area ? 0.0 : -1.0;
    if (cw == W && ch == H) return area; // whole-cell fallback
    if (!((r.x == 0 || r.z == W) && (r.y == 0 || r.w == H))) return -1.0; // must touch a corner
    if (!widthsOk(cw, ch, W, H)) return -1.0;
    float keptArea = area - float(cw * ch);
    float keptFilled = total - rectSum(sTD2DInputs[1], cs, r.x, r.y, r.z - 1, r.w - 1);
    return keptFilled >= uRatio * keptArea ? float(cw * ch) : -1.0;
}

void main() {
    ivec2 res = ivec2(uTD2DInfos[0].res.zw);
    ivec2 c = ivec2(gl_FragCoord.xy);
    ivec2 cs = cellStart(c, res);
    ivec2 size = cellStart(c + 1, res) - cs;
    int W = size.x, H = size.y;
    float area = float(W * H);
    float total = S(sTD2DInputs[1], cs, W - 1, H - 1);

    ivec4 rect;
    float cost;
    if (total >= uRatio * area) {
        rect = ivec4(0);
        cost = 0.0;
    } else {
        float best = 1e30;
        ivec2 bestP = ivec2(0);
        int bestCorner = -1;
        for (int v = 0; v < H; v++) {
            for (int u = 0; u < W; u++) {
                vec2 cand = texelFetch(sTD2DInputs[0], cs + ivec2(u, v), 0).rg;
                if (cand.g >= 0.0 && cand.r < best) {
                    best = cand.r;
                    bestP = ivec2(u, v);
                    bestCorner = int(cand.g);
                }
            }
        }
        int u = bestP.x, v = bestP.y;
        if (bestCorner == 0)      rect = ivec4(0, 0, u + 1, v + 1);
        else if (bestCorner == 1) rect = ivec4(u, 0, W, v + 1);
        else if (bestCorner == 2) rect = ivec4(0, v, u + 1, H);
        else if (bestCorner == 3) rect = ivec4(u, v, W, H);
        else                      rect = ivec4(0, 0, W, H);
        cost = bestCorner >= 0 ? best : area;
    }

    ivec4 prev = ivec4(round(texelFetch(sTD2DInputs[2], c, 0)));
    float prevCost = validCost(prev, cs, W, H, total);
    if (prevCost >= 0.0 && cost > prevCost - uHysteresis * area)
        rect = prev;

    fragColor = TDOutputSwizzle(vec4(rect));
}
```

### `pixel_smooth` → `glsl_smooth` (rgba32float, grid res)

Inputs: 0 = `null_target`, 1 = `feedback_smooth`, 2 = `in1` (resolution only).
It has an extra uniform, `uSmoothing`.

```glsl
// Stage 2c: ease the displayed rect toward the target rect each frame. A cut
// appearing grows out of its anchored corner; one disappearing shrinks into it.
// Input 0: target rects, input 1: previous frame's output, input 2: source image (for resolution).
uniform float uSmoothing; // 0 = no smoothing
out vec4 fragColor;

bool isEmpty(vec4 r) { return (r.z - r.x) * (r.w - r.y) < 0.5; }

// Zero-size rect at r's anchored corner.
vec4 collapse(vec4 r, ivec2 size) {
    float ax = r.x <= 0.5 ? 0.0 : float(size.x);
    float ay = r.y <= 0.5 ? 0.0 : float(size.y);
    return vec4(ax, ay, ax, ay);
}

void main() {
    ivec2 res = ivec2(uTD2DInfos[2].res.zw);
    ivec2 c = ivec2(gl_FragCoord.xy);
    ivec2 size = cellStart(c + 1, res) - cellStart(c, res);
    vec4 target = texelFetch(sTD2DInputs[0], c, 0);
    vec4 prev = texelFetch(sTD2DInputs[1], c, 0);

    if (isEmpty(target) && isEmpty(prev)) {
        fragColor = TDOutputSwizzle(vec4(0.0));
        return;
    }
    if (isEmpty(prev)) prev = collapse(target, size);
    if (isEmpty(target)) target = collapse(prev, size);

    vec4 r = mix(target, prev, uSmoothing);
    if (all(lessThan(abs(r - target), vec4(0.05)))) r = target;
    fragColor = TDOutputSwizzle(r);
}
```

### `pixel_mask` → `glsl_mask` (mono8fixed)

Inputs: 0 = `in1` (sets resolution), 1 = `null_smooth`.

```glsl
// Stage 3: 1 = keep, 0 = inside this cell's (smoothed) cut rect.
// Input 0: source image (sets resolution), input 1: per-cell rects.
out vec4 fragColor;
void main() {
    ivec2 res = ivec2(uTD2DInfos[0].res.zw);
    ivec2 p = ivec2(gl_FragCoord.xy);
    ivec2 c = cellOf(p, res);
    vec2 local = vec2(p - cellStart(c, res)) + 0.5;
    vec4 r = texelFetch(sTD2DInputs[1], c, 0);
    bool cut = all(greaterThanEqual(local, r.xy)) && all(lessThan(local, r.zw));
    fragColor = TDOutputSwizzle(vec4(cut ? 0.0 : 1.0));
}
```

### TOP settings

- **Every GLSL TOP:** Input Smoothness `nearest`. Vectors 0–3 are `uGrid`
  (x = `parent.Cellmask.par.Gridcols`, y = `parent.Cellmask.par.Gridrows`),
  `uRatio` (`Fillratio`), `uMinWidth` (`Minwidth`) and `uHysteresis`
  (`Hysteresis`).
- **`glsl_smooth` only:** vector 4 is `uSmoothing` (`Smoothing`).
- **Grid-resolution TOPs** (`glsl_params`, `glsl_smooth`, `constant_init`):
  Output Resolution `custom`, with width and height set by expression to
  `Gridcols` and `Gridrows`.
- **Feedback TOPs:** `feedback_target.top = null_target` and
  `feedback_smooth.top = null_smooth`. Both take `constant_init` as their input.
- **The COMP** has parent shortcut `Cellmask`.
