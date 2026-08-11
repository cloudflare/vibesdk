import type { ComponentType } from "react";
import { Blockprint } from "./blockprint.tsx";
import { Broadsheet } from "./broadsheet.tsx";
import { Nocturne } from "./nocturne.tsx";
import { Phosphor } from "./phosphor.tsx";
import type { ExampleProps } from "./shared.ts";
import { Unstyled } from "./unstyled.tsx";

export type ExampleCredit = {
  readonly role: string;
  readonly value: string;
};

export type Example = {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly tagline: string;
  /** Applied to the page wrapper, so a theme restyles the whole page. */
  readonly themeClass: string;
  readonly credits: readonly ExampleCredit[];
  readonly Component: ComponentType<ExampleProps>;
};

export const defaultExample: Example = {
  id: "unstyled",
  label: "Unstyled",
  title: "As shipped",
  tagline:
    "No theme, no class names, no options. Only the structural stylesheet the package ships, over browser defaults. Every colour, font and size falls back to inherit, so this is the honest baseline a consumer starts from.",
  themeClass: "theme-unstyled",
  credits: [
    { role: "Type", value: "browser default" },
    { role: "Palette", value: "none" },
    { role: "Code theme", value: "package default" },
  ],
  Component: Unstyled,
};

export const examples: readonly Example[] = [
  defaultExample,
  {
    id: "phosphor",
    label: "Phosphor",
    title: "Phosphor terminal",
    tagline:
      "An amber CRT: scanlines, drifting grain, hairline boxes and a block cursor that blinks on whatever row you selected. Uppercase tracking everywhere, folders shouted, submodules struck through.",
    themeClass: "theme-phosphor",
    credits: [
      { role: "Type", value: "JetBrains Mono" },
      { role: "Palette", value: "amber on carbon" },
      { role: "Code theme", value: "vesper" },
    ],
    Component: Phosphor,
  },
  {
    id: "broadsheet",
    label: "Broadsheet",
    title: "Broadsheet edition",
    tagline:
      "Print rules, not boxes. Cream stock with a fibre weave, a Fraunces masthead set at display optical size, Newsreader for the tree, and JetBrains Mono for code and labels.",
    themeClass: "theme-broadsheet",
    credits: [
      { role: "Type", value: "Fraunces / Newsreader / JetBrains Mono" },
      { role: "Palette", value: "cream, ink, vermilion" },
      { role: "Code theme", value: "vitesse-light" },
    ],
    Component: Broadsheet,
  },
  {
    id: "blockprint",
    label: "Blockprint",
    title: "Blockprint poster",
    tagline:
      "Acid yellow, three-pixel rules, hard offset shadows and zero radius. Rows invert on selection, buttons press into their own shadow, and the frame wears a rotated sticker.",
    themeClass: "theme-blockprint",
    credits: [
      { role: "Type", value: "Archivo Black / Archivo / JetBrains Mono" },
      { role: "Palette", value: "acid on carbon" },
      { role: "Code theme", value: "github-light" },
    ],
    Component: Blockprint,
  },
  {
    id: "nocturne",
    label: "Nocturne",
    title: "Nocturne glass",
    tagline:
      "A drifting four-point gradient mesh under a noise veil, frosted panels, pill rows that glow when selected, and a gradient-filled Syne masthead.",
    themeClass: "theme-nocturne",
    credits: [
      { role: "Type", value: "Syne / Sora / JetBrains Mono" },
      { role: "Palette", value: "plum, lilac, mint" },
      { role: "Code theme", value: "poimandres" },
    ],
    Component: Nocturne,
  },
];
