/*
 * Copyright © 2026 Fells Code, LLC
 * Licensed under the Apache License, Version 2.0
 * See LICENSE file in the project root for full license information
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// jsdom has no layout, so axe cannot measure color-contrast there: it reports the
// rule as incomplete rather than as a violation. This module stands in for that
// rule. It reads a screen's real stylesheet, resolves every custom property to its
// fallback (the default theme), and walks the rendered DOM the way a browser would
// for `color` (inherited) and backgrounds (composited up the ancestor chain).
//
// The jest config maps CSS modules to identity-obj-proxy, so `styles.button`
// renders as class="button" and the class names here are the stylesheet's own.

export type Rgba = [number, number, number, number];

const NAMED: Record<string, Rgba> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
};

export const parseColor = (value: string): Rgba | null => {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  if (v === 'none') return NAMED.transparent;

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map(d => d + d)
        : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];
    const [r, g, b] = digits.map(d => parseInt(d, 16));
    return [r, g, b, 1];
  }

  const fn = v.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const [r, g, b, a = 1] = fn[1].split(',').map(part => Number(part.trim()));
    return [r, g, b, a];
  }

  return null;
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an opaque colour. */
export const relativeLuminance = ([r, g, b]: Rgba) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG 2.x contrast ratio, rounded down to two places as axe reports it. */
export const contrastRatio = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

/** Paints `top` over an opaque `bottom`. */
export const composite = (top: Rgba, bottom: Rgba): Rgba => {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
};

/** Resolves `var(--name, fallback)` to its fallback, innermost first. */
export const resolveFallbacks = (value: string) => {
  let out = value;
  let previous;
  do {
    previous = out;
    out = out.replace(/var\(\s*--[\w-]+\s*,\s*((?:[^()]|\([^()]*\))+)\)/g, '$1');
  } while (out !== previous);
  return out.trim();
};

type Declarations = Record<string, string>;

export interface Stylesheet {
  /** Declarations of each `.class` rule, for the element at rest. */
  base: Map<string, Declarations>;
  /** Declarations of each `.class:hover` (optionally `:not(:disabled)`) rule. */
  hover: Map<string, Declarations>;
}

const STYLES_DIR = join(__dirname, '..', '..', 'src', 'styles');

export const loadStylesheet = (fileName: string): Stylesheet => {
  const css = readFileSync(join(STYLES_DIR, fileName), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');

  const sheet: Stylesheet = { base: new Map(), hover: new Map() };

  for (const [, selectorList, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Declarations = {};
    for (const [, property, value] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) {
      declarations[property.trim()] = resolveFallbacks(value);
    }

    for (const selector of selectorList.split(',').map(s => s.trim())) {
      const base = selector.match(/^\.([\w-]+)$/);
      const hover = selector.match(/^\.([\w-]+):hover(?::not\(:disabled\))?$/);
      const target = base ? sheet.base : hover ? sheet.hover : null;
      const name = (base ?? hover)?.[1];
      if (!target || !name) continue;
      target.set(name, { ...target.get(name), ...declarations });
    }
  }

  return sheet;
};

const declarationsFor = (
  element: Element,
  sheet: Stylesheet,
  state: 'rest' | 'hover'
): Declarations => {
  const merged: Declarations = {};
  for (const name of Array.from(element.classList)) {
    Object.assign(merged, sheet.base.get(name));
    if (state === 'hover') Object.assign(merged, sheet.hover.get(name));
  }
  return merged;
};

const backgroundOf = (declarations: Declarations): Rgba | null => {
  const value = declarations['background-color'] ?? declarations.background;
  return value === undefined ? null : parseColor(value);
};

// What sits behind the screen is the host page. White is what an unstyled host
// gives, and every bundled screen paints its own opaque card over it anyway.
const PAGE_BACKGROUND: Rgba = [255, 255, 255, 1];

export interface ContrastResult {
  text: string;
  className: string;
  state: 'rest' | 'hover';
  foreground: Rgba;
  background: Rgba;
  ratio: number;
  required: number;
}

const ownText = (element: Element) =>
  Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent ?? '')
    .join('')
    .trim();

const isDisabled = (element: Element) =>
  (element as HTMLButtonElement).disabled === true ||
  element.closest('[aria-disabled="true"]') !== null;

/**
 * Every rendered element with its own text, with the contrast its text has at rest
 * and, where the stylesheet has one, on hover. Disabled controls are left out, as
 * WCAG 1.4.3 exempts inactive components and axe skips them.
 */
export const measureTextContrast = (
  root: Element,
  sheet: Stylesheet
): ContrastResult[] => {
  const results: ContrastResult[] = [];

  for (const element of Array.from(root.querySelectorAll('*'))) {
    const text = ownText(element);
    if (!text || isDisabled(element)) continue;

    const states: Array<'rest' | 'hover'> = Array.from(element.classList).some(name =>
      sheet.hover.has(name)
    )
      ? ['rest', 'hover']
      : ['rest'];

    for (const state of states) {
      const chain: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        chain.push(node);
      }

      const own = (node: Element) =>
        declarationsFor(node, sheet, node === element ? state : 'rest');

      const colorValue = chain.map(node => own(node).color).find(Boolean);
      const foreground = parseColor(colorValue ?? 'black') ?? NAMED.black;

      const layers = chain.map(node => backgroundOf(own(node))).filter(Boolean) as Rgba[];
      const background = layers
        .reverse()
        .reduce((under, layer) => composite(layer, under), PAGE_BACKGROUND);

      const sizeValue = chain.map(node => own(node)['font-size']).find(Boolean);
      const weightValue = chain.map(node => own(node)['font-weight']).find(Boolean);
      const px = sizeValue?.endsWith('rem') ? parseFloat(sizeValue) * 16 : 16;
      const weight = weightValue === 'bold' ? 700 : Number(weightValue ?? 400);
      const large = px >= 24 || (px >= 18.66 && weight >= 700);

      results.push({
        text,
        className: element.getAttribute('class') ?? element.tagName.toLowerCase(),
        state,
        foreground,
        background,
        ratio: contrastRatio(composite(foreground, background), background),
        required: large ? 3 : 4.5,
      });
    }
  }

  return results;
};

export const describeFailures = (results: ContrastResult[]) =>
  results
    .filter(result => result.ratio < result.required)
    .map(
      r =>
        `.${r.className}${r.state === 'hover' ? ':hover' : ''} "${r.text}": ${r.ratio} (needs ${r.required})`
    );
