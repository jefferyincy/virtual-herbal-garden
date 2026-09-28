---
name: Nocturnal Botanical Field Guide
colors:
  surface: '#111412'
  surface-dim: '#111412'
  surface-bright: '#373a37'
  surface-container-lowest: '#0c0f0d'
  surface-container-low: '#191c1a'
  surface-container: '#1d201e'
  surface-container-high: '#282b28'
  surface-container-highest: '#323533'
  on-surface: '#e1e3df'
  on-surface-variant: '#bccabd'
  inverse-surface: '#e1e3df'
  inverse-on-surface: '#2e312f'
  outline: '#879489'
  outline-variant: '#3d4a40'
  surface-tint: '#5dde96'
  primary: '#6eeea5'
  on-primary: '#00391f'
  primary-container: '#4fd18b'
  on-primary-container: '#005631'
  inverse-primary: '#006d40'
  secondary: '#ffb597'
  on-secondary: '#571f02'
  secondary-container: '#773618'
  on-secondary-container: '#fda27b'
  tertiary: '#ffcab7'
  on-tertiary: '#571e04'
  tertiary-container: '#ffa37f'
  on-tertiary-container: '#78371b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7bfbb1'
  primary-fixed-dim: '#5dde96'
  on-primary-fixed: '#002110'
  on-primary-fixed-variant: '#00522f'
  secondary-fixed: '#ffdbcd'
  secondary-fixed-dim: '#ffb597'
  on-secondary-fixed: '#360f00'
  on-secondary-fixed-variant: '#743416'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#743418'
  background: '#111412'
  on-background: '#e1e3df'
  surface-variant: '#323533'
  bg-sunken: '#070A08'
  bg-base: '#0A0D0B'
  bg-surface: '#121713'
  bg-raised: '#171E19'
  bg-hover: '#1D251F'
  border-subtle: rgba(255, 255, 255, 0.06)
  border-strong: rgba(255, 255, 255, 0.11)
  text-primary: '#E6EDE8'
  text-secondary: '#9BACA0'
  text-muted: '#6A7A6F'
  text-disabled: '#47524A'
  text-on-accent: '#06110B'
  accent-400: '#7BE0A8'
  accent-500: '#4FD18B'
  accent-600: '#35A96D'
  accent-tint: rgba(79, 209, 139, 0.12)
  accent-glow: rgba(79, 209, 139, 0.28)
  clay-400: '#E39A72'
  clay-500: '#D9845F'
  clay-tint: rgba(217, 132, 95, 0.12)
  warning: '#E0A458'
  danger: '#D9645C'
  danger-tint: rgba(217, 100, 92, 0.12)
  success: '#4FD18B'
typography:
  display:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: '600'
    lineHeight: 59px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 42px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 46px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  botanical-title:
    fontFamily: Noto Serif
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: 0em
  botanical-body:
    fontFamily: Noto Serif
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 15px
    letterSpacing: 0.08em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
---

## Brand & Style

The design system embodies the quiet, focused atmosphere of a nocturnal botanical expedition. Designed for researchers, herbalists, and inquisitive botanists observing plant life at twilight, the aesthetic balances precise scientific instrumentation with organic living matter. The emotional resonance is reverent, focused, and scholarly—evoking a sense of quiet discovery in an illuminated conservatory after hours.

### Visual Style
The aesthetic fuses dark minimalism with selective scientific HUD overlays. Surfaces are near-black organic deep greens, avoiding clinical pitch black or sterile neutrals. Spatial depth is governed by restrained negative space, 1px low-contrast hairline borders, and delicate top-edge highlights rather than heavy ambient drop shadows. Frosted glass elements are strictly reserved for floating HUD viewports and inspection panels, maintaining structural clarity across all core reading and cataloging workflows.

## Colors

The palette is tuned exclusively for low-light legibility, utilizing rich chlorophyllic dark tones rather than achromatic grays.

### Surface Hierarchy
- **Base Canvas (`#0A0D0B`)**: Deep moss-black foundation for the entire viewport canvas. Pure `#000000` is strictly forbidden.
- **Sunken Wells (`#070A08`)**: Used for background viewports, graphic canvases, and depressed data containers.
- **Card Surfaces (`#121713`)**: Default layer for structured cards, content panes, and navigation rails.
- **Raised Tiers (`#171E19`)**: Modals, popovers, contextual tooltips, and floating HUDs.

### Accent Rules
- **Living Green (`#4FD18B` / `#7BE0A8`)**: Represents dynamic botanical vitality. Used sparingly for interactive focal points, active states, progress indicators, and primary CTAs. Accent color coverage must never exceed 10% of any viewport.
- **Terracotta Clay (`#D9845F` / `#E39A72`)**: Earthy secondary accent deployed strictly for Latin botanical nomenclature, curated taxonomic highlights, and non-destructive warning flags.
- **Contrast & Legibility**: Body typography (`#E6EDE8`) guarantees greater than 7:1 contrast on base canvas, while secondary metadata (`#9BACA0`) maintains greater than 4.5:1.

## Typography

The typographic hierarchy establishes clear categorical separations through three distinct roles:

1. **System & Structural UI (Inter)**: Clean, utilitarian grotesque used for application frame, headings, narrative copy, and navigational controls. Reading paragraphs must be capped at 68 characters per line. Cards must never contain more than two distinct type sizes.
2. **Botanical Nomenclature (Serif Italic)**: All formal Latin binomials and plant taxonomy names (*e.g., Ocimum tenuiflorum*, *Artemisia absinthium*) must be rendered in italicized serif styling, invoking classical field journals and botanical folios.
3. **Observation & Laboratory Data (JetBrains Mono)**: Monospaced typography is reserved for scientific catalog IDs, dosage metrics, specimen timers, chemical compounds, and uppercase category micro-tags (e.g., `LAMIACEAE · AERIAL PARTS`).

## Layout & Spacing

Layout rhythm follows a strict 4px sub-grid anchored on 8px baseline increments (4, 8, 12, 16, 24, 32, 48, 64, 96px). Generous negative space is treated as an active structural element to convey calm and contemplation.

### Layout Geometry
- **Desktop (1440px viewport)**: 12-column fluid grid, 24px (`1.5rem`) gutters, max-width bounded to 1200px. Fixed primary scientific navigation sidebar set to 248px width.
- **Section Rhythm**: Sections are separated by `space-3xl` (64px) to preserve breathing room between thematic specimen groups.
- **Card Internals**: Compact widgets utilize `space-lg` (20px) internal padding, while complex field observation cards utilize `space-xl` (24px).
- **Responsive Adaptations**: Breakpoints at 768px (Tablet, 8 columns, 16px gutter) and 480px (Mobile, 4 columns, 16px margins). The sidebar collapses into a bottom docked drawer or top bar on viewports below 1024px.

## Elevation & Depth

Visual hierarchy does not rely on diffused drop shadows, which muddy dark canvas compositions. Instead, elevation is expressed through tonal tiers, deliberate 1px border luminosities, and directional top rim highlights.

- **Level 0 (Base / Well)**: Flat `#0A0D0B` canvas with 1px `border-subtle` (`rgba(255, 255, 255, 0.06)`).
- **Level 1 (Card / Container)**: Surface color `#121713` bound by `border-subtle`, capped with an inner top hairline highlight (`linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.09), transparent)`).
- **Level 2 (Raised / Flyout / HUD)**: Elevated background `#171E19` paired with `border-strong` (`rgba(255, 255, 255, 0.11)`) and a deep, low-spread ambient shadow (`0 12px 32px rgba(0, 0, 0, 0.45)`).
- **Level 3 (Modal / Overlays)**: Surface `#171E19` over a backdrop wash of `rgba(5, 8, 6, 0.72)` supported by an 8px blur.
- **Level 4 (Active Focus Glow)**: Border accent `#35A96D` paired with an atmospheric outer glow (`0 8px 32px rgba(79, 209, 139, 0.28)`), used only on selected specimens or targeted interactive nodes.
- **HUD Glass Distinction**: 16px backdrop blur is strictly reserved for floating HUD analytical panels and top navigation overlays (`rgba(10, 13, 11, 0.8)`). Standard inventory and documentation cards must remain fully opaque.

## Shapes

The geometric framework balances scientific precision with tactile comfort through consistent curved radiuses:

- **Micro Chips & Badges**: 4px radius for tight, legible taxonomy indicators and status tags.
- **Inputs & Form Controls**: 8px radius for search boxes, numerical counters, and dropdown triggers.
- **Buttons**: 10px radius across all variants to provide an organic, comfortable finger-and-cursor target.
- **Cards & Panes**: 16px radius for primary field guide cards, metric panels, and list groups.
- **Modals & Floating HUDs**: 20px radius reinforcing independent floating instruments.
- **Pills**: Fully rounded (999px) for active filter states, navigation pills, and botanical categorization chips.

## Components

### Buttons
- **Primary**: Solid `#4FD18B` fill, `#06110B` contrasting text, 10px radius, 44px height, 600 weight. Subtle scale transition (`scale(0.985)`) on press.
- **Secondary**: Transparent background, 1px `border-strong`, `#E6EDE8` text. Hover shifts background to `#1D251F`.
- **Ghost**: No border, `#9BACA0` text, transitioning to `#E6EDE8` with `#1D251F` background on interaction.
- **Danger**: Soft background tint `rgba(217, 100, 92, 0.12)`, 1px `#D9645C` border, `#D9645C` text. Never use solid saturated red fills.

### Chips & Badges
- **Data Chip**: `rgba(79, 209, 139, 0.12)` fill with `#7BE0A8` text, 999px pill radius, 11px uppercase JetBrains Mono.
- **Taxonomic / Filter Chip**: Inactive state features `border-subtle` with `#9BACA0` text. Active state transitions to `#4FD18B` outline with matching faint glow and green-tinted fill.

### Inputs & Form Fields
- 44px height, `#121713` surface fill, 8px radius, framed by 1px `border-subtle`.
- Focus state triggers an immediate, unblurred 2px focus ring tinted with `accent-glow` (`rgba(79, 209, 139, 0.40)`) with a 2px offset.

### Specimen & Stat Cards
- Enclosed in Level 1 elevation (16px radius, `#121713` fill, hairline perimeter border, top horizontal hairline highlight).
- Layout contains thumbnail image at top, botanical name in serif italics, common name in Inter bold, and JetBrains Mono micro labels. Never exceed two typography sizes inside one card.

### Safety Warning Banner
- Required on every medicinal plant profile. Spans full width of the card or detail header with `danger-tint` background, anchored by a 3px solid `#D9645C` left indicator bar. Accompanied by a 1.5px stroke warning triangle icon and persistent warning copy. Banners are strictly non-dismissible.

### Scientific HUD Overlay Panel
- Floating glass layer with `bg-raised` at 85% opacity, 16px backdrop blur, 20px corner radius, and subtle 1px border. Houses live telemetry, light exposure curves, and soil balance metrics.