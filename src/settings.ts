"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "./shared/backgroundSettings";
import { LicenceSettings } from "./shared/licenceSettings";
import { CodexThemeSettings } from "./shared/codexThemeSettings";
import { BorderSettings } from "./shared/borderSettings";
import { CardSignatureSettings } from "./shared/cardSignatureSettings";

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

export function textAlignFor(v: string | undefined): string {
    return v === "center" || v === "right" ? v : "left";
}

class TitleSettingsCard extends FormattingSettingsCard {
    showTitle = new formattingSettings.ToggleSwitch({ name: "showTitle", displayName: "Show Title", value: false });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title Text", placeholder: "Visual title", value: "" });
    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font Size", value: 14 });
    titleBold = new formattingSettings.ToggleSwitch({ name: "titleBold", displayName: "Bold", value: true });
    titleItalic = new formattingSettings.ToggleSwitch({ name: "titleItalic", displayName: "Italic", value: false });
    titleUnderline = new formattingSettings.ToggleSwitch({ name: "titleUnderline", displayName: "Underline", value: false });
    titleFont = new formattingSettings.FontControl({
        name: "titleFont", displayName: "Font",
        fontFamily: this.titleFontFamily, fontSize: this.titleFontSize,
        bold: this.titleBold, italic: this.titleItalic, underline: this.titleUnderline
    });
    titleAlign = new formattingSettings.AlignmentGroup({
        name: "titleAlign", displayName: "Alignment",
        mode: powerbi.visuals.AlignmentGroupMode.Horizonal, value: "left"
    });
    titleColor = new formattingSettings.ColorPicker({
        name: "titleColor", displayName: "Font Color",
        value: { value: "#1a1a2e" }, instanceKind: ConstantOrRule
    });
    name = "titleSettings"; displayName = "Visual Title";
    slices: FormattingSettingsSlice[] = [this.showTitle, this.titleText, this.titleFont, this.titleAlign, this.titleColor];
}

class EqualiserCard extends FormattingSettingsCard {
    mode = new formattingSettings.ItemDropdown({
        name: "mode", displayName: "Colour mode",
        items: [
            { displayName: "By value (G-A-R)", value: "byValue" },
            { displayName: "Spectrum by category", value: "spectrum" },
        ],
        value: { displayName: "By value (G-A-R)", value: "byValue" },
    });
    rows = new formattingSettings.NumUpDown({
        name: "rows", displayName: "Block rows", value: 16,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 4 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 40 },
        },
    });
    showPeaks = new formattingSettings.ToggleSwitch({ name: "showPeaks", displayName: "Peak-hold", value: true });
    blockWidth = new formattingSettings.NumUpDown({
        name: "blockWidth", displayName: "Block width", value: 26,
        description: "Block width in board units (column pitch is 34)",
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 6 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 32 },
        },
    });
    greenColor = new formattingSettings.ColorPicker({
        name: "greenColor", displayName: "Band - floor",
        description: "Blank = automatic (theme token)",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });
    amberColor = new formattingSettings.ColorPicker({
        name: "amberColor", displayName: "Band - shoulder",
        description: "Blank = automatic (theme token)",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });
    redColor = new formattingSettings.ColorPicker({
        name: "redColor", displayName: "Band - crest",
        description: "Blank = automatic (theme token)",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });
    name = "equaliser"; displayName = "Equalizer";
    slices: FormattingSettingsSlice[] = [
        this.mode, this.rows, this.blockWidth, this.showPeaks,
        this.greenColor, this.amberColor, this.redColor,
    ];
}

class AxisCard extends FormattingSettingsCard {
    showAxisTitles = new formattingSettings.ToggleSwitch({
        name: "showAxisTitles", displayName: "Show axis titles",
        description: "X title below the labels, Y title rotated beside the meter",
        value: false,
    });
    xAxisTitle = new formattingSettings.TextInput({
        name: "xAxisTitle", displayName: "X axis title", placeholder: "X axis title", value: "",
    });
    yAxisTitle = new formattingSettings.TextInput({
        name: "yAxisTitle", displayName: "Y axis title", placeholder: "Y axis title", value: "",
    });
    color = new formattingSettings.ColorPicker({
        name: "color", displayName: "Title color",
        description: "Blank = automatic (theme token)",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });
    name = "axisSettings"; displayName = "Axis";
    slices: FormattingSettingsSlice[] = [this.showAxisTitles, this.xAxisTitle, this.yAxisTitle, this.color];
}

class LabelStyleCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", description: "0 = automatic", value: 0 });
    bold = new formattingSettings.ToggleSwitch({ name: "bold", displayName: "Bold", value: false });
    italic = new formattingSettings.ToggleSwitch({ name: "italic", displayName: "Italic", value: false });
    font = new formattingSettings.FontControl({
        name: "labelFont", displayName: "Font",
        fontFamily: this.fontFamily, fontSize: this.fontSize, bold: this.bold, italic: this.italic
    });
    color = new formattingSettings.ColorPicker({
        name: "color", displayName: "Color",
        description: "Blank = automatic (theme token)",
        value: { value: "" }, instanceKind: ConstantOrRule,
    });
    align = new formattingSettings.AlignmentGroup({
        name: "align", displayName: "Alignment",
        mode: powerbi.visuals.AlignmentGroupMode.Horizonal, value: "center"
    });
    name = "labelStyle"; displayName = "Label";
    slices: FormattingSettingsSlice[] = [this.font, this.color, this.align];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    equaliser = new EqualiserCard();
    axisSettings = new AxisCard();
    titleSettings = new TitleSettingsCard();
    labelStyle = new LabelStyleCard();
    background = new BackgroundSettings();
    codexTheme = new CodexThemeSettings();
    cardSignature = new CardSignatureSettings();
    visualBorder = new BorderSettings();

    licence = new LicenceSettings();

    cards = [this.equaliser, this.axisSettings, this.titleSettings, this.labelStyle, this.background, this.codexTheme, this.cardSignature, this.visualBorder, this.licence];
}
