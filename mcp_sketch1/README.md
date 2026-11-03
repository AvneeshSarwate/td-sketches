# p5_td_canvas

A minimal template TouchDesigner project for writing **TypeScript p5 sketches that
render inside TouchDesigner**. A CPlusPlus TOP loads the avTools plugin, which
compiles a `.ts` file in `avtools-project/` and draws it into the TOP with a
p5-style API on WebGPU. The project also includes the TouchDesigner MCP server
(`TDMCP`), so an agent can inspect and edit the live network.

Treat this folder as a starting point. You change the sketch by editing
TypeScript. You change the network (inputs, post-processing, outputs) through
the TD MCP.

## Layout

```text
p5_td_canvas/
  p5_td_canvas.toe          TD project (p5_td_canvas.2.toe = latest incremental save, Backup/ = TD autosaves)
  TDMCP.tox                 TD MCP server component (also instanced at /project1/TDMCP)
  Plugins/                  avTools native plugins. Do not edit.
    AvToolsSketch.plugin      TOP plugin (image output) - used by /project1/cplusplus1
    AvToolsChannels.plugin    CHOP plugin (channel output) - not used yet
    README.md                 end-user install/setup guide for the plugins
  avtools-project/          TypeScript project. EDIT CODE HERE.
    README.md                 full API guide: TOP/CHOP APIs, params, timing, MIDI/OSC/files, diagnostics
    tsconfig.json             extends sdk/tsconfig.json; includes examples/ and sketches/
    examples/                 shipped example sketches (catalog in avtools-project/README.md)
    sketches/                 (create it) put your own entries here
    sdk/                      generated type declarations + library source. Don't edit; gitignored
    .avtools/                 build caches. Disposable; never edit or select these files
```

## TouchDesigner network (`/project1`)

| Operator | What it is |
| --- | --- |
| `cplusplus1` (cplusplusTOP) | The sketch. **Load → Plugin Path** = `Plugins/AvToolsSketch.plugin`. **Build → TypeScript File** = `avtools-project/examples/background/main.ts`. Default 1280×720 on the Sketch page. |
| `TDMCP` (baseCOMP) | MCP server used by the agent. Leave it alone. |

Nothing is wired to `cplusplus1` yet, and nothing comes after it. When you
extend the network, end chains with a `null` (for example
`cplusplus1 → null_out`) and reference the null.

All file-path parameters are **relative to the project folder** (where the
`.toe` lives), so the folder can be moved or cloned: `plugin` =
`Plugins/AvToolsSketch.plugin`, `Typescript` = `avtools-project/...`,
`Templatedir` = `.`. Keep new path parameters relative too.

## Where to change things

| Goal | Where |
| --- | --- |
| Change what the current sketch draws | `avtools-project/examples/background/main.ts` (helper: `palette.ts`) |
| Start a new sketch | Create `avtools-project/sketches/<name>/main.ts` (or copy an example), then set `cplusplus1`'s `Typescript` par to its project-relative path (e.g. `avtools-project/sketches/<name>/main.ts`) |
| Add UI controls (sliders, colors, pulses) | `export const parameters = {...}` in the entry file. Controls appear on the TOP's **Controls** page after the build. |
| Feed images/channels into the sketch | Wire TOPs into `cplusplus1` (`frame.top(i)`), or a CHOP into its Controls CHOP input (`frame.chop(name)`). See `examples/inputs/picture.ts`. |
| Output channels instead of an image | Add a CPlusPlus CHOP with `Plugins/AvToolsChannels.plugin`, then set Output Channels/Samples on it. See `examples/channels/main.ts`. |
| Resolution | Width/Height on `cplusplus1`'s Sketch page. Read `frame.width`/`frame.height` in code. |
| API details | `avtools-project/README.md`. Exact types are in `avtools-project/sdk/packages/native-webgpu/*.d.ts` (`td-sketch.d.ts`, `td-parameters.d.ts`, `td-types/p5.d.ts`, ...). |

The current sketch, for reference:

```ts
// avtools-project/examples/background/main.ts
export const parameters = {
  Size:  { type: 'float', default: 70, min: 1, max: 300, clamp: true },
  Color: { type: 'rgb',   default: [1, 0.47, 0.235] },
  Speed: { type: 'float', default: 1, min: 0, max: 4 },
} as const satisfies ParameterDefinitions;

export const draw: Draw<typeof parameters> = (p, frame) => { /* pulsing bg + circle */ };
```

A TOP entry exports `draw` (required), plus optional `setup(p, host)`,
`parameters`, and `onPulse`.

## Edit → see loop

1. Edit and save the `.ts` file. Automatic Builds recompiles it and Automatic
   Reload activates it. No terminal or Node is needed.
2. Check the result through the MCP. Use `get_errors` / `view_operator` on
   `/project1/cplusplus1`. For build diagnostics and `console.log` output, put
   an Info DAT on `cplusplus1` (Diagnostics page → Info DAT View = Diagnostics
   or Logs).
3. A type error keeps the last working bundle running, so a frame that looks
   unchanged may mean the build failed. Always check diagnostics.
4. Every reload starts from fresh JS state. Module variables do not survive.

## Gotchas for agents

- Sketch code runs in an embedded V8 isolate. It is **not** a browser and **not**
  Node. There is no `window`, `document`, `fetch`, `setInterval`, `fs`, or TD
  Python (`op()`, `parent()`). Do not add DOM or Node types to tsconfig to
  silence errors. Use `host.files`, `host.osc`, `host.udp`, `host.midi`, and the
  operator's inputs and declared parameters instead.
- Use `@avtools/core-timing` (TimeContext) or `frame.frame` for animation timing.
- `parameters` must be a literal object exported directly from the entry file.
  Spreads, helper functions, and imported declarations don't work. Names must
  be Capitalized (`Size`, not `size`).
- The git repo root is `../` (`Documents/TouchDesigner`). This project is
  one folder in it. `avtools-project/.gitignore` excludes `sdk/` and `.avtools/`.
- Edit the `.toe` only through TD / the MCP. Don't touch `Plugins/` or `sdk/`.
