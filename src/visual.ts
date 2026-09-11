"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel, textAlignFor } from "./settings";

import { toRgba } from "./shared/colorHelpers";
import { Theme, accentToken } from "./shared/bandEngine";
import { surfaceTokens } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { applyBorder } from "./shared/borderSettings";
import { renderEqualiser, EqColumn } from "./equaliser";
import { LicenseGate } from "./shared/licensing";
import { formatModelNumber } from "./shared/numberFormat";

/** Luminance theme pick off the shared Background card (suite idiom). */
function themeFor(hex: string): Theme {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "light";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? "dark" : "light";
}

interface ColumnData extends EqColumn {
    sortOrder: number | null;
    selectionId: ISelectionId;
    tooltipItems: VisualTooltipDataItem[];
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private target: HTMLElement;
    private rootDiv: HTMLDivElement;
    private svg: SVGSVGElement | null = null;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private isHighContrast = false;
    private hcForeground = "";
    private hcBackground = "";
    private cornerSignature: CardSignatureHandle | null = null;
    private columnEls: SVGGElement[] = [];
    // Selection state is held as identity keys, never display indices: a re-sort or a
    // filtered-out category would otherwise hand the lit state to whichever column now
    // sits at that index (NEXUS cycle-04 §1).
    private columnKeys: string[] = [];
    private selectedKeys = new Set<string>();

    private licenseGate: LicenseGate;

    private lastUpdateOptions: VisualUpdateOptions | null = null;


    constructor(options: VisualConstructorOptions) {

        // NO FREE TIER — an unlicensed user gets the whole visual blocked.

        // The check is async, so re-run the last update once it resolves.

        this.licenseGate = new LicenseGate(options.host, () => {

            if (this.lastUpdateOptions) this.update(this.lastUpdateOptions);

        });
        this.host = options.host;
        this.target = options.element;
        this.target.style.margin = "0";
        this.target.style.padding = "0";
        this.target.style.overflow = "hidden";
        this.events = options.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = options.host.tooltipService;
        this.formattingSettingsService = new FormattingSettingsService();

        // Single context menu listener — Policy 1180.2.5 (MS sample BarChart pattern).
        this.target.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        this.rootDiv = document.createElement("div");
        this.rootDiv.className = "codex-visual-root";
        this.target.appendChild(this.rootDiv);

        // Corner-bracket card signature (suite kit) — overlays the tile,
        // pointer-events:none, refreshed per render.
        this.cornerSignature = makeCornerBrackets(
            this.target,
            accentToken("dark"),
            { variant: "cornerBracket", mirror: true }
        );

        this.selectionManager.registerOnSelectCallback(() => {
            this.selectedKeys.clear();
            this.applySelectionDim();
        });

        // Click on empty canvas clears selection.
        this.rootDiv.addEventListener("click", () => {
            if (this.selectedKeys.size) {
                this.selectionManager.clear();
                this.selectedKeys.clear();
                this.applySelectionDim();
            }
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        this.lastUpdateOptions = options;

        if (this.licenseGate.blockedThisFrame()) {
            this.target.style.display = "none";
            this.events.renderingFinished(options);
            return;
        }
        this.target.style.display = "";
        try {
            const colorPalette = this.host.colorPalette as ISandboxExtendedColorPalette;
            this.isHighContrast = !!colorPalette.isHighContrast;
            if (this.isHighContrast) {
                this.hcForeground = colorPalette.foreground.value;
                this.hcBackground = colorPalette.background.value;
            }

            const dv: DataView | undefined = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(VisualFormattingSettingsModel, dv);

            while (this.rootDiv.firstChild) this.rootDiv.removeChild(this.rootDiv.firstChild);
            this.svg = null;
            this.columnEls = [];
            this.columnKeys = [];

            // ── Theme + suite chrome ──
            const background = this.formattingSettings.background;
            const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const bgTransparencyPct = background.transparency.value ?? 100;
            const theme: Theme = themeFor(bgHex);
            this.target.style.background = this.isHighContrast
                ? this.hcBackground : toRgba(bgHex, bgTransparencyPct);
            applyBorder(this.target, this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                palette: this.host.colorPalette,
                metadataObjects: undefined,
            });
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: accentToken(theme),
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                mirror: true,
                glowMix: this.isHighContrast ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

            const titleHeight = this.renderTitle(theme);

            const cols = dv ? this.parseColumns(dv) : [];
            if (cols.length === 0) {
                this.renderEmpty();
                this.events.renderingFinished(options);
                return;
            }

            const eq = this.formattingSettings.equaliser;
            const ax = this.formattingSettings.axisSettings;
            const ls = this.formattingSettings.labelStyle;
            const width = options.viewport.width;
            const height = options.viewport.height;

            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", String(width));
            svg.setAttribute("height", String(height - titleHeight));
            svg.style.display = "block";
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            svg.appendChild(group);
            this.rootDiv.appendChild(svg);
            this.svg = svg;

            renderEqualiser({
                group,
                width,
                height: height - titleHeight,
                titleHeight: 0,
                theme,
                hc: this.isHighContrast,
                hcFg: this.hcForeground,
                hcBg: this.hcBackground,
                columns: cols,
                highlightActive: !!dv?.categorical?.values?.find(
                    v => v.source.roles && v.source.roles["value"])?.highlights,
                rows: eq.rows.value ?? 16,
                mode: String(eq.mode.value?.value || "byValue"),
                showPeaks: !!eq.showPeaks.value,
                blockWidth: eq.blockWidth.value ?? 26,
                axis: {
                    show: !!ax.showAxisTitles.value,
                    xTitle: ax.xAxisTitle.value || "",
                    yTitle: ax.yAxisTitle.value || "",
                    color: ax.color.value?.value || null,
                },
                bandOverride: {
                    sg: eq.greenColor.value?.value || null,
                    sa: eq.amberColor.value?.value || null,
                    sm: eq.redColor.value?.value || null,
                },
                labelFont: {
                    family: ls.fontFamily.value || null,
                    size: ls.fontSize.value ?? null,
                    bold: !!ls.bold.value,
                    italic: !!ls.italic.value,
                    color: ls.color.value?.value || null,
                },
                align: (ls.align.value as string) || "center",
                onColumnEl: (el, i) => this.wireColumn(el, i, cols[i]),
            });
            this.applySelectionDim();

            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
        }
    }

    /** Identity key for a column's selection id — the handle selection state is kept under. */
    private keyOf(id: ISelectionId): string {
        return String(id.getKey());
    }

    private wireColumn(el: SVGGElement, index: number, col: ColumnData): void {
        this.columnEls[index] = el;
        const key = this.keyOf(col.selectionId);
        this.columnKeys[index] = key;
        el.style.cursor = "pointer";
        el.addEventListener("mousemove", (e: MouseEvent) => {
            this.tooltipService.show({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: col.tooltipItems,
                identities: [col.selectionId],
            });
        });
        el.addEventListener("mouseleave", () => {
            this.tooltipService.hide({ isTouchEvent: false, immediately: false });
        });
        el.addEventListener("click", (e: MouseEvent) => {
            const multi = e.ctrlKey || e.metaKey;
            this.selectionManager.select(col.selectionId, multi).then((ids: ISelectionId[]) => {
                if (!multi) this.selectedKeys.clear();
                if (ids.length === 0) this.selectedKeys.clear();
                else if (this.selectedKeys.has(key) && multi) this.selectedKeys.delete(key);
                else this.selectedKeys.add(key);
                this.applySelectionDim();
            });
            e.stopPropagation();
        });
    }

    // Reconciles the retained identity keys against the columns as they stand now, so a
    // data/format update that re-sorts or drops rows re-lights the category that is
    // actually selected. A selected category that has left the data lights nothing — its
    // state is never transferred to the row that took its place (NEXUS cycle-04 §1).
    private applySelectionDim(): void {
        const any = this.selectedKeys.size > 0;
        this.columnEls.forEach((el, i) => {
            if (el) el.style.opacity = any && !this.selectedKeys.has(this.columnKeys[i]) ? "0.35" : "1";
        });
    }

    private parseColumns(dv: DataView): ColumnData[] {
        const cat = dv.categorical;
        if (!cat?.categories?.length) return [];
        const labels = cat.categories[0];
        const valuesArr = cat.values || [];
        const findCol = (role: string) => valuesArr.find(v => v.source.roles && v.source.roles[role]);
        const valueCol = findCol("value");
        const peakCol = findCol("peak");
        const sortCol = findCol("sortOrder");
        const tooltipCols = valuesArr.filter(v => v.source.roles && v.source.roles["tooltips"]);
        if (!valueCol) return [];

        const out: ColumnData[] = [];
        const n = labels.values?.length ?? 0;
        for (let i = 0; i < n; i++) {
            const label = String(labels.values[i] ?? "");
            const vRaw = valueCol.values?.[i];
            const value = typeof vRaw === "number" ? vRaw : (vRaw == null ? NaN : Number(vRaw));
            if (!isFinite(value)) continue;
            const pRaw = peakCol?.values?.[i];
            const peak = typeof pRaw === "number" ? pRaw : (pRaw == null ? null : Number(pRaw));

            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(labels, i)
                .createSelectionId();

            const tooltipItems: VisualTooltipDataItem[] = [
                { displayName: labels.source.displayName || "Category", value: label },
                { displayName: valueCol.source.displayName, value: this.formatValue(value, valueCol.source.format ?? null) },
            ];
            if (peak != null && isFinite(peak)) {
                tooltipItems.push({ displayName: peakCol!.source.displayName, value: this.formatValue(peak, peakCol!.source.format ?? null) });
            }
            for (const tc of tooltipCols) {
                const tv = tc.values?.[i];
                if (tv != null) tooltipItems.push({ displayName: tc.source.displayName, value: this.formatValue(tv as number, tc.source.format ?? null) });
            }

            const sRaw = sortCol?.values?.[i];
            const sortOrder = typeof sRaw === "number" ? sRaw : (sRaw == null ? null : Number(sRaw));

            const hRaw = valueCol.highlights?.[i];
            const highlight = typeof hRaw === "number" ? hRaw : (hRaw == null ? null : Number(hRaw));

            out.push({
                label, value,
                peak: (peak != null && isFinite(peak)) ? peak : null,
                highlight: (highlight != null && isFinite(highlight)) ? highlight : null,
                sortOrder: (sortOrder != null && isFinite(sortOrder)) ? sortOrder : null,
                selectionId, tooltipItems,
            });
        }
        // Columns follow the Sort order well ascending when supplied (suite
        // idiom, same as KPI Wall) — host category order otherwise.
        if (out.some(c => c.sortOrder != null)) {
            out.sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER));
        }
        return out;
    }

    private renderTitle(theme: Theme): number {
        const t = this.formattingSettings.titleSettings;
        if (!t?.showTitle?.value || !t?.titleText?.value) return 0;
        const el = document.createElement("div");
        el.className = "codex-visual-title";
        el.textContent = t.titleText.value;
        if (t.titleFontFamily?.value) el.style.fontFamily = t.titleFontFamily.value;
        if (t.titleFontSize?.value) el.style.fontSize = `${t.titleFontSize.value}px`;
        el.style.fontWeight = t.titleBold?.value ? "700" : "400";
        el.style.fontStyle = t.titleItalic?.value ? "italic" : "normal";
        el.style.textDecoration = t.titleUnderline?.value ? "underline" : "none";
        el.style.textAlign = textAlignFor(t.titleAlign?.value as string);
        // Untouched default ink flips to the dark-theme text token (suite
        // idiom); a user-set colour is honoured.
        const set = t.titleColor?.value?.value;
        const c = set === "#1a1a2e" && theme === "dark" ? surfaceTokens("dark").text : set;
        if (c) el.style.color = this.isHighContrast ? this.hcForeground : c;
        this.rootDiv.appendChild(el);
        return el.getBoundingClientRect().height || 24;
    }

    // Landing state — fills the body so right-click reaches our DOM
    // regardless of which region the cert reviewer hits.
    private renderEmpty(): void {
        const wrap = document.createElement("div");
        wrap.className = "codex-visual-empty";
        const h = document.createElement("div");
        h.className = "codex-visual-empty-title";
        h.textContent = "Codex Equalizer Bar";
        const p = document.createElement("div");
        p.className = "codex-visual-empty-body";
        p.textContent = "Add a Category and a Value measure. Optional: Peak / Target measure for the floating peak-hold block.";
        wrap.appendChild(h);
        wrap.appendChild(p);
        this.rootDiv.appendChild(wrap);
    }

    private formatValue(n: number, format: string | null): string {
        if (n == null || !isFinite(n)) return String(n ?? "");
        // Optional `#` digits are honoured: a single derived count used as both
        // min and max rendered `0.##` 12.34 as "12" (NEXUS cycle-02 F3).
        return formatModelNumber(n, format);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        // Drop the in-flight licence check FIRST: its redraw callback replays
        // update() against a torn-down target otherwise (NEXUS lifecycle finding).
        this.licenseGate.dispose();
        while (this.rootDiv && this.rootDiv.firstChild) this.rootDiv.removeChild(this.rootDiv.firstChild);
        this.rootDiv = null;
        this.target = null;
    }
}
