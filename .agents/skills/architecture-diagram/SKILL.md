---
name: architecture-diagram
description: Create or update architecture and flow diagrams for screen-relay's docs. Use when a docs page needs a diagram of components, data flow, or a pipeline, or when an existing diagram in docs/public/diagrams changes.
metadata:
  internal: true
---

# Architecture diagram

Diagrams are standalone HTML files that the docs embed with the `Diagram` component. Follow the technical-writer skill for any prose.

## Folder convention

- Save each diagram as `docs/public/diagrams/<slug>/index.html`, using a short kebab-case slug.
- Keep the file standalone with inline CSS and SVG. Start from [references/template.html](references/template.html) and follow [references/style.md](references/style.md).
- Support `?theme=light` and `?theme=dark`. Without either, follow `prefers-color-scheme` and default to dark. Keep the page background transparent for embeds.
- Give the SVG a `<title>` and `<desc>` that describe its flow.

## Draw the real mechanism

Draw for the page's reader. Show what they see, do, and how the flow connects. Use plain English labels; omit code identifiers, protocols, endpoints, codecs, and library names unless the page is for contributors. Use at most 5-7 nodes in an overview diagram and move extra detail to the page text. Use the solid borders, Geist tokens, spacing, type, icons, arrows, and labels in [references/style.md](references/style.md) and [references/template.html](references/template.html).

Use orthogonal connectors only, and never rotate text. Align nodes on shared rows and columns. Size the viewBox to the content with 16–24px margins and no large empty areas. For separately labeled directions between the same nodes, use parallel lines 16px apart with one label above and one below. A shared label can use one bidirectional line.

## Embed it

```mdx
<Diagram name="architecture" title="screen-relay architecture" aspectRatio="720 / 288" />
```

Set `aspectRatio` to the SVG `viewBox` width and height. The component passes the site theme to the diagram.

## Text version

Add a short text flow beside the diagram. Keep the same nodes, order, and arrow labels so it works without the image and for screen readers.

## Check it

Check both themes and confirm the embedded page stays transparent. At the 720px viewBox width, verify that text fits inside nodes, labels do not touch lines or each other, arrows stop 4-6px before node edges, and spacing follows the 8px grid.
