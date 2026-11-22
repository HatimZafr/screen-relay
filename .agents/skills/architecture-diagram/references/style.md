# Diagram style tokens

Use Geist colors, solid borders, and a left-to-right flow. Overview diagrams have at most 5–7 nodes. Labels describe what the page's reader sees and does.

## Colors

Use these exact Geist tokens from the docs site's theme. Borders and text use solid colors, never alpha.

| Token | Light | Dark | Diagram role |
| --- | --- | --- | --- |
| `--ds-background-100` | `oklch(1 0 0)` | `oklch(0 0 0)` | Standalone page background |
| `--ds-background-200` | `oklch(0.984 0 0)` | `oklch(0.027 0 0)` | Container fill |
| `--ds-gray-100` | `oklch(0.961 0 0)` | `oklch(0.218 0 0)` | Node fill |
| `--ds-gray-200` | `oklch(0.94 0 0)` | `oklch(0.239 0 0)` | Hover fill; unused in static diagrams |
| `--ds-gray-400` | `oklch(0.937 0 0)` | `oklch(0.301 0 0)` | Node and container borders |
| `--ds-gray-500` | `oklch(0.836 0 0)` | `oklch(0.39 0 0)` | Hover border; unused in static diagrams |
| `--ds-gray-600` | `oklch(0.732 0 0)` | `oklch(0.623 0 0)` | Arrows |
| `--ds-gray-900` | `oklch(0.42 0 0)` | `oklch(0.706 0 0)` | Second lines, arrow labels, container titles, and icons |
| `--ds-gray-1000` | `oklch(0.205 0 0)` | `oklch(0.946 0 0)` | Node labels |
| `--ds-blue-100` | `oklch(97.32% 0.0141 251.56)` | `oklch(22.17% 0.069 259.89)` | Unused; keep node fills gray |
| `--ds-blue-700` | `oklch(57.61% 0.2508 258.23)` | `oklch(57.61% 0.2321 258.23)` | Engine border accent |
| `--ds-blue-900` | `oklch(53.18% 0.2399 256.99)` | `oklch(71.7% 0.1648 250.79)` | Alternative engine icon accent |

## Background

Keep `html` and `body` transparent when embedded. Containers retain their background-200 fill. Set `color-scheme` to match the theme so the browser does not paint an opaque iframe background.

`?theme=light` or `?theme=dark` overrides `prefers-color-scheme`. Without a parameter, follow the system preference, with dark as the fallback. Only standalone pages (`window.self === window.top`) set `data-top` and paint background-100.

## Borders and shapes

- Draw each border once: solid 1px, with `vector-effect: non-scaling-stroke`. No dashes.
- Use radius 6 for nodes and 12 for containers.
- Use an 8px spacing grid: node padding 16, node gaps 48–64, and container padding 24. Reserve space above nodes for the container title.
- Align nodes on shared rows and columns. Give nodes in a row the same height and vertical center. Size widths for text and icons.

## Typography

Use `Geist, "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif`. Keep the HTML standalone; do not request external fonts.

| Element | Size | Weight | Color |
| --- | --- | --- | --- |
| Node label | 14px | 500 | gray-1000 |
| Second line | 13px | 400 | gray-900 |
| Arrow label | 12px | 400 | gray-900 |
| Container title | 13px | 500 | gray-900 |

Left-align node text. Never rotate text. Put the icon left of the label with an 8px gap. Estimate label width at 7.5px per character and second-line width at 7px per character; include padding when checking fit.

## Connectors

- Use gray-600, 1px strokes, and small open arrowheads with round caps and joins.
- Meet the center of the node edge, stopping 4–6px short of its border.
- Keep labels 8px from their line, including descenders. Labels never overlap lines, nodes, or other labels.
- For separately labeled directions between the same nodes, use parallel lines 16px apart, with one label above and one below. Center the pair around the edge midpoint. A single line with arrowheads at both ends and one shared label also works.
- Use orthogonal connectors only. Avoid crossings and connectors that loop under panels. Expand the layout when labels need more room.

## Icons

Give every node a 16px inline SVG line icon: stroke 1.5, round caps and joins, and no fill. Use gray-900 or gray-1000. Use a monitor for Desktop, a CPU or code symbol for the engine, a globe for Browser, and a terminal or person for an agent.

## Highlighted node

Use one blue accent on the engine border or its icon. Keep its fill gray-100. Do not add a floating highlight or colored backdrop.

## Size and scaling

Use one responsive SVG with `viewBox` width 720, `width: 100%`, and `height: auto`. Size the viewBox to the content with 16–24px margins and no large empty areas. Match the page's `<Diagram aspectRatio>` to the viewBox dimensions; the template uses `720 / 208`.

Keep a short text version beside each embed with the same nodes, directions, and labels. Check both themes, text fit, label clearance, and arrow endpoints.
