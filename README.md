# Living Particle

A field of drifting particles where some of them are secretly ideas.

Move the mouse through the field: the nearest hidden node "catches" like iron to a magnet, follows you, and reveals an image card plus lines to the topics it connects to. Move on and it hands off to the next node. Type a topic in the search bar ("I want to learn about Machine Learning") to pull the matching node to the surface.

Plain HTML, CSS and canvas. No build step, no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## How it works

- **`particles.js`**: 260 background particles plus one particle per content node, all drawn on a single `<canvas>`. Every frame the closest node within `catchRadius` (160 px) is magnetised and lerps towards the cursor; it releases after `magnetMaxTime` (3 s) or when it drifts past `releaseRadius`.
- **Connections**: the active node's `connections` are drawn as SVG lines and their cards fade in, then out over `connRevealFade`.
- **`data.js`**: the knowledge graph. Each node has a label, tags, an image and the ids it connects to. Swap in your own topics and images.

All tuning lives in the `CFG` object at the top of `particles.js`.

## Ideas to try

- Drive the magnet with a webcam hand-tracker instead of the mouse
- Generate `data.js` from a real knowledge base or your notes

Placeholder images come from [picsum.photos](https://picsum.photos).
