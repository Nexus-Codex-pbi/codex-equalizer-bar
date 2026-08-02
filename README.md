# Codex Equalizer Bar

## Overview
An LED-block equalizer for Power BI. Every category becomes a column of stacked blocks, with its peak held above the stack. It reads like studio metering hardware rather than a bar chart — which is the point on a wallboard. Built for comparing a handful of categories where the shape of the board matters as much as the numbers: channel revenue, regional load, utilisation by line.

> **Naming:** the marketplace offer and every customer-facing string use the **z** spelling (*Equalizer*). The repository folder, `visual.name`, the GUID and the internal format-card property `equaliser` keep the **s** spelling — they are identity, not display text, and renaming them would break saved reports.

## Features
- Two colour modes — **by value**, where each column takes its own band colour, and **spectrum**, where colour runs across the whole board
- Block resolution is configurable (default 16 rows) — a chunky board or a fine meter
- Adjustable block width
- Optional peak markers, driven by a separate Peak / Target field
- Green, amber and red band colours are all configurable
- Optional sort order measure controls the order columns appear in (ascending)
- Optional axis titles with their own colour
- Full font control on category labels — family, size, bold, italic, colour and alignment
- Background colour with transparency; border with width, colour and radius
- Card signature accent with style, colour, corner radius and mirrored corners
- Click a column to cross-filter other visuals; highlights arriving from other visuals are read and rendered
- Custom tooltips, keyboard focus and high contrast mode support

## Data Roles
| Role | Display Name | Kind | Required? | Description |
|------|--------------|------|-----------|-------------|
| category | Category | Grouping | Yes | One column per category |
| value | Value | Measure | Yes | Column level — blocks light up to this value |
| peak | Peak / Target | Measure | No | Floating peak-hold block (period high, target, or prior period) |
| sortOrder | Sort order | Measure | No | Numeric sort key — columns follow it ascending (e.g. month number) |
| tooltips | Tooltips | Measure | No | Extra measures for the hover tooltip |

`dataReductionAlgorithm` is deliberately capped at **100** rows. This is a board of per-category columns, not a scrolling dataset.

## Formatting Options

### Visual Title
Show Title, Title Text, Font Family, Font Size, Bold, Italic, Underline, Alignment, Font Colour.

### Equalizer
- **Mode** — By value or Spectrum
- **Block rows** — default 16
- **Block width**
- **Show peaks**
- **Green / Amber / Red colour**

### Axis
Show axis titles, X axis title, Y axis title, Colour.

### Label
Font Family, Font Size, Bold, Italic, Colour, Alignment.

### Background / Border / Card signature
Background colour and transparency; border show, colour, transparency, width and radius; card signature show, style, auto colour, colour, corner radius and mirrored corners.

## Build
Node 20, `powerbi-visuals-tools` 7.0.2, `powerbi-visuals-api` 5.11.0, TypeScript 5.5.4.

```bash
npm install
npm run package     # writes dist/<guid>.<version>.pbiviz
npx eslint src      # 0 errors expected
```

No external network calls, no third-party services and no telemetry.

---
Built by [Nexus Codex](https://nexuscodex.nexus). Support: support@nexuscodex.nexus
