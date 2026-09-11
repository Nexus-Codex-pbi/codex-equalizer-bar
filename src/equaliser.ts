"use strict";

/* ─── Codex Equaliser Bar — LED block renderer ──────────────────────────────
 * Geometry, tokens and colour logic ported VERBATIM from the normative board:
 * docs/design-session-2026-07-09/Codex Equaliser Bar.dc.html (renderVals():
 * pitch/yOf/bandOf/ramp, theme dicts, pk outline classes). The board is the
 * spec (feedback_pbi_design_board_is_look_source). One deliberate deviation:
 * the board demos peak-hold as lit+2; here the floater comes from the real
 * Peak/Target measure — no fabricated peaks (feedback_no_placeholders).
 */

import { select, Selection } from "d3-selection";
import { Theme } from "./shared/bandEngine";

export interface EqTokens {
    sg: string; sa: string; sm: string;   // band colours: floor / shoulder / crest
    track: string;                        // unlit block stub
    stops: [string, string, string];      // spectrum brand ramp
    unit: string;                         // axis label ink
    base: string;                         // baseline stroke
    pkStroke: string;                     // peak-hold outline
    pkGlow: boolean;
}

export function eqTokens(theme: Theme): EqTokens {
    return theme === "dark" ? {
        sg: "#8aff2b", sa: "#ffb020", sm: "#ff3b52",
        track: "#1b1b38", stops: ["#00d9ff", "#7c3aed", "#ff2bd6"],
        unit: "#8f8ab8", base: "rgba(124,58,237,0.24)",
        pkStroke: "rgba(255,255,255,0.85)", pkGlow: true,
    } : {
        sg: "#1f8a3b", sa: "#a85f00", sm: "#c81d6b",
        track: "#e2e4ef", stops: ["#0384a3", "#6d28d9", "#c81d6b"],
        unit: "#5b5b74", base: "rgba(124,58,237,0.16)",
        pkStroke: "rgba(0,0,0,0.45)", pkGlow: false,
    };
}

/* ─── Board colour ramp (verbatim) ────────────────────────────────────────── */
function hexRgb(c: string): [number, number, number] {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: string, b: string, t: number): string {
    const A = hexRgb(a), B = hexRgb(b);
    return "#" + [0, 1, 2].map(i =>
        Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("");
}
export function ramp(stops: [string, string, string], t: number): string {
    return t < 0.5 ? lerp(stops[0], stops[1], t * 2) : lerp(stops[1], stops[2], (t - 0.5) * 2);
}

/* ─── Label fitting (NEXUS cycle-04 §5) ────────────────────────────────────
 * Columns sit on a fixed 34-unit pitch, so a label wider than that pitch runs
 * into its neighbour: full weekday names overlapped in all six neighbouring
 * pairs, and the three-letter labels overlapped at font size 24. The board
 * design is not negotiable, so the label is fitted to it — measured first,
 * shrunk to the layout's capacity down to a floor, then ellipsised. The full
 * text stays available on hover through the column's own tooltip, which
 * already carries the untruncated category.
 */
const LABEL_PITCH = 34;
const LABEL_GUTTER = 2;
const LABEL_MIN_PX = 6;

function fitLabel(node: SVGTextElement, full: string, requestedPx: number): void {
    // getComputedTextLength reports board units here: the scale transform lives
    // on an ancestor group, so the text's own user space is the design box.
    if (typeof node.getComputedTextLength !== "function") return;
    // Labels are centred on the pitch, so neighbours only collide once a label is
    // WIDER than the pitch — measuring against pitch-minus-gutter instead shrank
    // labels that were already clearing each other by 1.58px. Trigger on the real
    // collision threshold; fit to the gutter only once we have to act.
    const avail = LABEL_PITCH - LABEL_GUTTER;
    let length = node.getComputedTextLength();
    if (!(length > LABEL_PITCH)) return;   // no collision possible — render untouched

    // Aim a hair inside the gutter: shrinking to exactly `avail` leaves the
    // re-measure on the boundary, which ellipsised labels that in fact fit.
    const shrunk = Math.max(LABEL_MIN_PX, requestedPx * (avail * 0.97 / length));
    if (shrunk < requestedPx) {
        node.style.fontSize = `${shrunk.toFixed(2)}px`;
        length = node.getComputedTextLength();
    }
    if (!(length > avail)) return;

    let cut = full;
    while (cut.length > 1) {
        cut = cut.slice(0, -1);
        node.textContent = cut + "…";
        if (node.getComputedTextLength() <= avail) return;
    }
}

export interface EqColumn {
    label: string;
    value: number;      // raw
    peak: number | null;
    highlight: number | null;   // cross-highlight value from another visual
}

export interface EqFont {
    family: string | null;
    size: number | null;    // null/0 = board-proportional 10.5px
    bold: boolean;
    italic: boolean;
    color: string | null;   // null/"" = unit token
}

export interface EqAxis {
    show: boolean;
    xTitle: string;
    yTitle: string;
    color: string | null;   // null/"" = unit token
}

export interface EqCtx {
    group: SVGGElement;
    width: number;
    height: number;
    titleHeight: number;
    theme: Theme;
    hc: boolean;
    hcFg: string;
    hcBg: string;
    columns: EqColumn[];
    highlightActive: boolean;   // a cross-highlight is in play (dim + relight)
    rows: number;
    mode: string;           // byValue | spectrum
    showPeaks: boolean;
    blockWidth: number;     // board units, 6-32 within the 34 pitch (board 26)
    bandOverride: { sg: string | null; sa: string | null; sm: string | null };
    labelFont: EqFont;
    align: string;          // axis label anchor: left|center|right within column
    axis: EqAxis;
    onColumnEl?: (el: SVGGElement, index: number) => void;
}

/* ─── Render (board viewBox 34n+32 × 252) ─────────────────────────────────── */
export function renderEqualiser(ctx: EqCtx): void {
    const t = eqTokens(ctx.theme);
    const hc = ctx.hc, fg = ctx.hcFg;
    const n = ctx.columns.length;
    if (n === 0) return;

    const rows = Math.max(4, Math.min(40, Math.round(ctx.rows || 16)));
    const bw = Math.max(6, Math.min(32, Math.round(ctx.blockWidth || 26)));
    const bx = (26 - bw) / 2;   // centre the block in the board's 26-wide slot

    // Axis-title bands extend the design box; geometry inside stays board-
    // verbatim. Y title gets a left band (rotated -90 — never horizontal over
    // the data), X title a bottom band with clearance off the edge (both per
    // the Variance Waterfall axis-title gotchas).
    const showX = ctx.axis.show && !!ctx.axis.xTitle;
    const showY = ctx.axis.show && !!ctx.axis.yTitle;
    const padL = showY ? 22 : 0;
    const padB = showX ? 22 : 0;
    const coreW = 34 * n + 32;
    const designW = coreW + padL;
    const designH = 252 + padB;

    const sg = ctx.bandOverride.sg || t.sg;
    const sa = ctx.bandOverride.sa || t.sa;
    const sm = ctx.bandOverride.sm || t.sm;

    // Board maths (verbatim): pitch 210 across the meter, blocks 26 wide.
    const pitch = 210 / rows;
    const h = +Math.max(pitch - 3, 3).toFixed(2);
    const yOf = (r: number) => +(226 - (r + 1) * pitch).toFixed(2);
    const bandOf = (r: number) => { const f = (r + 0.5) / rows; return f < 0.6 ? sg : f < 0.85 ? sa : sm; };

    // Normalise against the data max (values and peaks share the scale).
    let max = 0;
    for (const c of ctx.columns) {
        if (isFinite(c.value)) max = Math.max(max, c.value);
        if (c.peak != null && isFinite(c.peak)) max = Math.max(max, c.peak);
    }
    if (max <= 0) max = 1;

    // Fit the design box into the viewport (suite fitGroup idiom).
    const sel = select(ctx.group);
    sel.selectAll("*").remove();
    const availH = Math.max(10, ctx.height - ctx.titleHeight);
    // The 8-unit minimum margin was applied without checking it fitted: at 8x8 it
    // consumed more than the viewport, so (width - 2m) went negative and the whole
    // board rendered mirrored at scale(-0.0296) (NEXUS cycle-04 §4). Cap the
    // margin at a quarter of the shorter side — that only bites below 32px, so
    // ordinary tiles keep the exact margin and scale they had.
    const minSide = Math.min(ctx.width, availH);
    const m = Math.min(Math.max(8, minSide * 0.05), minSide / 4);
    const s = Math.min((ctx.width - 2 * m) / designW, (availH - 2 * m) / designH);
    if (!(s > 0) || !isFinite(s)) return;
    const outer = sel.append("g").attr("transform",
        `translate(${((ctx.width - designW * s) / 2).toFixed(2)},${(ctx.titleHeight + (availH - designH * s) / 2).toFixed(2)}) scale(${s.toFixed(4)})`);

    const axisInk = hc ? fg : (ctx.axis.color || t.unit);
    if (showY) {
        outer.append("text")
            .attr("transform", "translate(9,122) rotate(-90)")
            .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
            .attr("fill", axisInk)
            .style("font-family", "Segoe UI, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif")
            .style("font-size", "11px").style("font-weight", "600")
            .style("letter-spacing", "0.06em")
            .text(ctx.axis.yTitle);
    }
    if (showX) {
        outer.append("text")
            .attr("x", padL + coreW / 2).attr("y", designH - 8)
            .attr("text-anchor", "middle")
            .attr("fill", axisInk)
            .style("font-family", "Segoe UI, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif")
            .style("font-size", "11px").style("font-weight", "600")
            .style("letter-spacing", "0.06em")
            .text(ctx.axis.xTitle);
    }

    const g = outer.append("g").attr("transform", `translate(${padL},0)`);

    g.append("line")
        .attr("x1", 12).attr("y1", 228).attr("x2", coreW - 12).attr("y2", 228)
        .attr("stroke", hc ? fg : t.base).attr("stroke-width", 1.5);

    ctx.columns.forEach((col, i) => {
        const x = 14 + i * 34;
        const v = Math.max(0, Math.min(col.value / max, 1));
        const lit = Math.round(v * rows);
        const colc = ctx.mode === "spectrum" ? ramp(t.stops, n === 1 ? 0 : i / (n - 1)) : null;

        // Cross-highlight (native-bar semantics): the full level dims to a
        // ghost, blocks up to the highlighted value stay fully lit.
        const litHi = ctx.highlightActive
            ? Math.round(Math.max(0, Math.min((col.highlight ?? 0) / max, 1)) * rows)
            : null;

        const colG = g.append("g").node() as SVGGElement;
        const cg = select(colG);

        for (let r = 0; r < rows; r++) {
            const on = r < lit;
            const ghost = on && litHi != null && r >= litHi;
            cg.append("rect")
                .attr("x", x + bx).attr("y", yOf(r)).attr("width", bw).attr("height", h).attr("rx", 2)
                .attr("fill", hc ? (on ? fg : "none") : (on ? (colc || bandOf(r)) : t.track))
                .attr("fill-opacity", ghost ? 0.28 : 1)
                .attr("stroke", hc && !on ? fg : "none").attr("stroke-width", hc && !on ? 1 : 0);
        }

        // Peak-hold floater — real measure only, rendered the hardware way:
        // a detached outlined block at the remembered level.
        if (ctx.showPeaks && col.peak != null && isFinite(col.peak) && col.peak > 0) {
            const pv = Math.max(0, Math.min(col.peak / max, 1));
            const pk = Math.max(0, Math.min(Math.round(pv * rows) - 1, rows - 1));
            const p = cg.append("rect")
                .attr("x", x + bx).attr("y", yOf(pk)).attr("width", bw).attr("height", h).attr("rx", 2)
                .attr("fill", hc ? "none" : (colc || bandOf(pk)))
                .attr("fill-opacity", litHi != null ? 0.28 : 1)
                .attr("stroke", hc ? fg : t.pkStroke).attr("stroke-width", 1.2);
            if (!hc && t.pkGlow) p.style("filter", "drop-shadow(0 0 4px rgba(255,255,255,0.4))");
        }

        // Axis label (board .axlab: 10.5px 600 unit ink, centred under the column).
        const lf = ctx.labelFont;
        const anchor = ctx.align === "left" ? "start" : ctx.align === "right" ? "end" : "middle";
        const lx = ctx.align === "left" ? x : ctx.align === "right" ? x + 26 : x + 13;
        const labelPx = (lf.size && lf.size > 0) ? lf.size : 10.5;
        const labelEl = cg.append("text")
            .attr("x", lx).attr("y", 245).attr("text-anchor", anchor)
            .attr("fill", hc ? fg : (lf.color || t.unit))
            .style("font-family", lf.family || "Segoe UI, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif")
            .style("font-size", `${labelPx}px`)
            .style("font-weight", lf.bold ? "700" : "600")
            .style("font-style", lf.italic ? "italic" : "normal")
            .style("letter-spacing", "0.04em")
            .text(col.label);
        // A lone column has no neighbour to collide with, so its label is left
        // exactly as it renders today.
        if (n > 1) fitLabel(labelEl.node() as SVGTextElement, col.label, labelPx);

        // Transparent hit surface for tooltip/selection over the whole column.
        cg.append("rect")
            .attr("x", x - 4).attr("y", 8).attr("width", 34).attr("height", 240)
            .attr("fill", "transparent");

        if (ctx.onColumnEl) ctx.onColumnEl(colG, i);
    });
}
