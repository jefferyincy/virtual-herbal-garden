# DESIGN.md — Virtual Herbal Garden
## Theme
Dark mode only. Minimal, modern, botanical. A field guide at night: near-black green
surfaces, one living green accent, generous negative space, and small precise details
that reward close looking. Restrained — never neon, never glassy everywhere, never busy.
## Colour
Background
  bg-base        #0A0D0B   app background (never pure black)
  bg-sunken      #070A08   behind canvas / wells
  bg-surface     #121713   cards, panels
  bg-raised      #171E19   popovers, dropdowns, modals
  bg-hover       #1D251F   row + card hover
  border-subtle  rgba(255,255,255,0.06)
  border-strong  rgba(255,255,255,0.11)
Text
  text-primary   #E6EDE8
  text-secondary #9BACA0
  text-muted     #6A7A6F
  text-disabled  #47524A
  text-on-accent #06110B
Accent — Living Green (primary, single brand colour)
  accent-400     #7BE0A8   highlights, glow, active chart line
  accent-500     #4FD18B   primary buttons, active states, progress
  accent-600     #35A96D   pressed, borders on accent elements
  accent-tint    rgba(79,209,139,0.12)   chip + badge fills
  accent-glow    rgba(79,209,139,0.28)   halos, focus rings
Warm accent — Terracotta (sparingly: botanical names, curated accents, safety system)
  clay-400       #E39A72
  clay-500       #D9845F
  clay-tint      rgba(217,132,95,0.12)
Semantic
  warning        #E0A458
  danger         #D9645C
  danger-tint    rgba(217,100,92,0.12)
  success        #4FD18B  (= accent-500)
Rules: one accent colour per screen besides semantic states. Accent covers at most 10% of
any screen. Never #000000, never #FFFFFF.
## Typography
UI + body      Inter
Botanical      Instrument Serif Italic — all Latin binomials, always italic
               e.g. *Ocimum tenuiflorum*
Data / labels  JetBrains Mono — taxonomy chips, IDs, dosage numbers, timers
display   56px / 1.05 / 600 / -0.02em    hero headline only
h1        40px / 1.15 / 600 / -0.015em   page titles
h2        28px / 1.20 / 600 / -0.01em    section titles
h3        20px / 1.30 / 600 / -0.005em   card titles
body-lg   17px / 1.65 / 400
body      15px / 1.60 / 400
small     13px / 1.50 / 400              captions, helper text
micro     11px / 1.40 / 500 / +0.08em / UPPERCASE   mono labels: "LAMIACEAE"
Max two type sizes per card. Line length capped at 68ch for reading views.
## Spacing & Layout
4px base, 8px grid: 4 8 12 16 24 32 48 64 96
Desktop 1440px frame, 12-column grid, 24px gutters, 1200px max content width.
Sidebar 248px. Page padding 32px. Card padding 20/24px. Section spacing 64px.
Generous whitespace is the primary design element — do not fill empty space.
## Radius
4px micro chips · 8px inputs · 10px buttons · 16px cards · 20px modals/HUD · 999px pills
## Elevation (dark mode lifts with light + border, not shadow)
L0  surface + 1px border-subtle
L1  card: surface + border-subtle + inner top highlight 1px rgba(255,255,255,0.08)
L2  raised: bg-raised + border-strong + 0 12px 32px rgba(0,0,0,0.45)
L3  modal: L2 + overlay rgba(5,8,6,0.72) + 8px backdrop blur
L4  accent glow: 1px accent-600 border + 0 8px 32px accent-glow (selected/focused only)
## Signature details (apply subtly, never all at once)
- Fine grain noise overlay at 2.5% opacity across dark backgrounds
- 1px top highlight line on cards: linear-gradient(90deg, transparent,
  rgba(255,255,255,0.09), transparent)
- Soft radial accent glow behind the hero and behind the selected plant
- Faint botanical line-art watermarks at 5% opacity in empty states and side panels
- Hairline dot-grid or contour-line page texture at 3% opacity
- Mono uppercase micro-labels as small deliberate accents on data ("PARTS USED · LEAF")
- Thin 2px accent progress bars with a 40% opacity trailing glow
- Status dots with a soft 1.6s pulse for live/growing state
## Motion
fast 120ms · base 180ms · slow 320ms · easing cubic-bezier(0.22, 1, 0.36, 1)
hover: translateY(-1px) + brighter border · press: scale(0.985)
focus-visible: 2px accent ring at 40% opacity, 2px offset — always visible
Subtle and physical. No bouncing, no infinite looping motion except the growing pulse.
Honour prefers-reduced-motion.
## Components
Primary button     accent-500 fill, text-on-accent, 10px radius, h44, 600 weight
Secondary button   transparent, 1px border-strong, text-primary
Ghost button       text-secondary, hover bg-hover
Danger button      danger-tint fill + danger border + danger text (never solid red)
Input              bg-surface, 1px border-subtle, 8px radius, h44, focus accent ring
Chip / tag         accent-tint bg, accent-400 text, 999px, 11px mono uppercase
Filter chip        unticked border-subtle + text-secondary; ticked accent-tint + accent
Card               16px radius, L1, image top, title h3, 2-line clamp
Stat card          micro mono label, 28px 600 value, delta with arrow icon
Tabs               underline 2px accent-500 active, text-secondary inactive, no boxes
Top nav            h64, bg-base 80% + 12px blur, logo left, links centre, actions right
HUD panel          bg-raised 85% + 16px blur, 20px radius, L2 — the ONLY glass surface
Modal              L3, 20px radius, max-width 560px, primary action right
Table              no zebra, hairline row dividers, mono uppercase header text-muted
Toast              bottom-right, bg-raised, 1px accent left bar, auto-dismiss 4s
Skeleton           surface blocks at 6% white, 1.4s shimmer, matches real layout
Empty state        centred line-art watermark, h3, one line, one action
Tooltip            12px, bg-raised, border-strong, 200ms delay
Badge tile         hexagonal — unlocked: accent edge + accent glow; locked: 30% opacity
Avatar             circle, 1px border-strong, accent level ring for active users
Safety banner (required on every plant view): full-width, danger-tint background, 3px solid
danger left bar, warning triangle line icon, danger heading. Never a toast, never dismissible.
## Iconography
One line-icon set, 1.5px stroke, 20px default / 24px in nav, rounded caps. No filled icons
except active nav state. No emoji anywhere in the UI.
## Data visualisation
Single-hue green ramp: #1F4A33 → #2F7A4E → #4FD18B → #7BE0A8 → #B4F0CE
Grid lines rgba(255,255,255,0.05), labels text-muted 11px mono. No rainbow palettes, no
3D charts. One highlighted series in accent-400, the rest text-muted. Legends are pills.
## Imagery
Plant photography cut out or on dark, soft green rim light. 3D scenes lit with a warm key
plus green rim to match the palette. Botanical line art in single-weight stroke on
transparent. Never bright saturated photos on flat dark without a scrim behind text.
## Accessibility
Body text ≥ 7:1 on bg-base, secondary ≥ 4.5:1, never below 4.5:1. Never colour alone —
pair with icon or label. 44×44 minimum tap target. Visible focus ring on everything.
Text over imagery always sits on a scrim.
## Rules
Do: flat surfaces layered with borders · one accent · whitespace carries the layout ·
italicise every botanical name · glass only for floating HUD panels · mono for numeric
and taxonomic data.
Don't: pure black or white · gradients on buttons · neon greens · glassmorphism on standard
cards · text shadows · more than two type sizes per card · emoji · looping decorative
animation · centred body paragraphs · colour as the only signal.
## Prompt prefix (paste before every screen prompt)
Dark mode web app, minimal modern botanical design system. Background #0A0D0B, cards
#121713 with 1px hairline borders and a subtle 1px top highlight, primary accent living
green #4FD18B used sparingly, warm terracotta #D9845F as a secondary accent, text #E6EDE8 /
#9BACA0. Inter for UI, Instrument Serif Italic for botanical names, JetBrains Mono for small
uppercase data labels. 16px radius cards, 10px buttons, 8px grid, generous whitespace, flat
surfaces, 1.5px line icons, no emoji, no gradients on buttons, no glassmorphism except
floating overlay panels, no pure black. Desktop 1440px, 12-column grid, 248px sidebar where
applicable.