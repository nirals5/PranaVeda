---
name: PranaVeda
description: AI-powered Ayurvedic wellness coach — your daily ritual, precisely composed.
colors:
  lavender: "#8A79A5"
  lavender-deep: "#71608E"
  lavender-tint: "#E8E1F2"
  terracotta: "#A66C5E"
  peach-tint: "#FBEDE9"
  slate-muted: "#90A4AE"
  blue-tint: "#DFE8FA"
  mint-tint: "#DDF5EE"
  ink: "#2D3436"
  stone-700: "#44515A"
  stone-500: "#78909C"
  stone-200: "#CFD8DC"
  stone-100: "#ECEFF1"
  warm-white: "#F5F3EF"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#EF4444"
typography:
  display:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "clamp(2.5rem, 6vw, 3rem)"
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-italic:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "normal"
  heading:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.3
  body-serif:
    fontFamily: "'Playfair Display', Georgia, serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.75
  body:
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "monospace"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.18em"
  micro:
    fontFamily: "monospace"
    fontSize: "0.5625rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.25em"
  timer:
    fontFamily: "monospace"
    fontSize: "4.5rem"
    fontWeight: 200
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  full: "9999px"
  2xl: "16px"
  xl: "12px"
  lg: "10px"
  md: "8px"
  sm: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.warm-white}"
    rounded: "{rounded.full}"
    padding: "12px"
  button-voice:
    backgroundColor: "#ffffff"
    textColor: "{colors.stone-700}"
    rounded: "{rounded.full}"
    padding: "12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.stone-700}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  input-soma:
    backgroundColor: "rgba(255,255,255,0.6)"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "14px 14px 14px 24px"
  chip-suggestion:
    backgroundColor: "rgba(255,255,255,0.4)"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "10px 24px"
  tab-active:
    backgroundColor: "{colors.lavender}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
  tab-inactive:
    backgroundColor: "transparent"
    textColor: "{colors.stone-500}"
    rounded: "{rounded.xl}"
    padding: "8px 20px"
  card-glass:
    backgroundColor: "rgba(255,255,255,0.55)"
    rounded: "{rounded.2xl}"
    padding: "24px"
---

# Design System: PranaVeda

## 1. Overview

**Creative North Star: "The Living Ritual"**

PranaVeda is designed to be a daily object, not a destination. Like a beautifully made journal or a precision health instrument — Oura ring energy in software — it exists to be used, then forgotten. Every screen is engineered to disappear: to surface the practice, the breath, the body, and then step aside. The interface does not celebrate itself.

The aesthetic draws from Apple Health's clinical data clarity, Oura's body-intelligence restraint, Calm's breath-aware motion, and Neo Mirai's editorial minimalism. The result is neither a meditation app nor a wellness dashboard. It is a ritual companion with a quiet, authoritative voice — one that knows something about your body and is calm about it.

Glass surfaces carry all the atmospheric weight. Playfair Display carries the sacred intelligence. Together they create the sensation of reading a beautifully typeset prescription written just for you. Sacred geometry, mystical iconography, and temple aesthetics are explicitly rejected: Ayurvedic wisdom here is a sophisticated body of knowledge expressed through precision, not ornamentation.

**Key Characteristics:**
- Glassmorphic surfaces used structurally, never decoratively
- Playfair Display + monospace label system creates the editorial-intelligence contrast axis
- Motion is slow, body-aware, and always reducible — it breathes, it does not perform
- Four dosha-mapped color tints carry semantic meaning; they are never purely decorative
- White space is active — silence is the brand voice

## 2. Colors: The Dosha Palette

A restrained palette anchored in Sacred Lavender, grounded by near-black Ink, and extended through four semantic dosha tints. Color is sparse on any given screen; the tints appear as context signals for the AI's wellness mapping, not as decoration.

### Primary
- **Sacred Lavender** (#8A79A5): The brand anchor. Active states, primary CTAs, label text, and brand moments. Never used as a background fill at full opacity. Covers ≤20% of any screen's surface area — its rarity is the point.
- **Deep Lavender** (#71608E): Hover and pressed states for lavender interactive elements. Also the focused input border treatment.

### Secondary
- **Warm Terracotta** (#A66C5E): Vata and fire-energy contexts. Dosha state badges, warmth accents in coaching results, selected state highlights in the Recovery dashboard.

### Tertiary
- **Muted Slate** (#90A4AE): Kapha metadata contexts. Secondary UI labels, placeholder treatments, and divider-level accents. Never used at full saturation on content.

### Neutral
- **Ink** (#2D3436): All body text and headings. Every high-contrast UI element. The floor.
- **Stone 700** (#44515A): Secondary text, supporting copy, icon fills.
- **Stone 500** (#78909C): Placeholder text, inactive tab labels, metadata lines.
- **Stone 200** (#CFD8DC): Dividers, hairline borders, card inner separators.
- **Stone 100** (#ECEFF1): Background tints inside nested containers.
- **Warm White** (#F5F3EF): Body background base and glass surface reference tone.

### Dosha Tints (Semantic Only)
- **Lavender Tint** (#E8E1F2): Vata/Air — clarity, movement, cognitive contexts.
- **Peach Tint** (#FBEDE9): Pitta/Fire — intensity, transformation, warmth contexts.
- **Mint Tint** (#DDF5EE): Kapha/Earth+Water — grounding, restoration, calm contexts.
- **Blue Tint** (#DFE8FA): Balanced/Water — flow, hydration, cooling contexts.

### Semantic
- **Success** (#10B981): Successful synthesis, saved ritual confirmations.
- **Warning** (#F59E0B): Fallback mode, degraded-service states.
- **Error** (#EF4444): Input validation failures, API errors.

### Named Rules
**The Tint Semantics Rule.** The four dosha tints (#E8E1F2, #FBEDE9, #DDF5EE, #DFE8FA) are semantic signals, not ambient color. Each maps to a dosha state surfaced in AI responses. Never apply them as general background fills or for visual interest alone.

**The Lavender Restraint Rule.** Sacred Lavender (#8A79A5) covers ≤20% of any given screen. One active state. One brand moment. Its scarcity is what makes it feel intentional.

## 3. Typography: The Instrument Voice

**Display Font:** Playfair Display (Georgia, serif fallback)
**Body Font:** Plus Jakarta Sans (system-ui, sans-serif fallback)
**Label/Mono:** System monospace

**Character:** Playfair's editorial weight and optical calligraphy carry the "ancient intelligence" voice. Plus Jakarta Sans grounds it in modern legibility. The monospace label system — small, uppercase, widely tracked — is the precision instrument readout layer: like a watch face alongside prose. This three-register system (Playfair / Jakarta / Mono) creates the full personality. Never collapse two registers into one role.

### Hierarchy
- **Display** (Playfair 300, clamp(2.5rem–3rem), -0.02em, 1.1 line-height): Hero greeting, page-level statements. One per screen. Always sentence case, always italic-optional.
- **Display Italic** (Playfair 300–400 italic, 2.25rem, 1.15 line-height): Section headings with dosha emphasis. "Restful *State*", "Elevated *Vata*". The mix of 300 and 400 within one heading is intentional.
- **Heading** (Playfair 400, 1.5rem, 1.3 line-height): Card titles, coaching category headers, modal titles.
- **Body Serif Quote** (Playfair 400 italic, 0.9375rem, 1.75 line-height): AI coaching text, philosophical copy, in-practice guidance. Max 65ch. This is the "voice of the oracle."
- **Body Sans** (Plus Jakarta Sans 400, 1rem, 1.6 line-height): UI descriptions, chip text, secondary information. Max 70ch.
- **Label** (mono 700, 0.6875rem, 0.18em tracked, UPPERCASE): Badge text, tab labels, section markers. The instrument-readout register. Used wherever a data readout or categorical label is needed.
- **Micro** (mono 700, 0.5625rem, 0.25em tracked, UPPERCASE): Footer, sub-badges, status chips. Maximum one use per screen.
- **Timer** (mono 200, 4.5rem, -0.02em, 1.0 line-height): Breathwork countdown displays only. This size and weight exists nowhere else in the system.

### Named Rules
**The Register Contrast Rule.** Every typographic composition must cross at least two registers: Playfair prose + mono label, or display serif + body sans. Never place two mono-only or two serif-only elements at the same hierarchy level.

**The Sentence Case Rule.** Display and heading text is always sentence case. UPPERCASE is reserved exclusively for the Label and Micro registers — the instrument readout layer. Uppercase Playfair Display is prohibited.

## 4. Elevation

PranaVeda uses **glass layering** as its sole depth language. There are no traditional card drop-shadows or hard elevation surfaces. Depth is created through white/alpha fills and `backdrop-filter: blur()`, simulating frosted glass panels over an ambient gradient background. Surfaces closer to the user carry higher white opacity; background or subordinate elements have lower opacity or none.

**Three glass levels in use:**
- **Glass Card** (white/55%, blur 12px, 1px white/80% border): Primary content containers — coaching panels, modal surfaces, insight cards.
- **Glass Input** (white/60%, blur 20px, 1px white/80% border): The Soma input capsule and interactive input containers.
- **Glass Light** (white/40%, blur 8px, 1px white/60% border): Tab switcher, navigation pill, suggestion chips, secondary containers.

Borders on glass surfaces catch ambient light — white/60–80% — rather than defining hard edges. They are halos, not outlines.

### Shadow Vocabulary
The system is shadow-free at rest. One exception: a barely-perceptible `0 10px 30px rgba(0,0,0,0.03)` under the Soma input capsule and primary coaching cards — just enough lift to separate them from the background gradient, not enough to read as "floating." On hover, the Soma input's shadow shifts to `0 12px 36px rgba(138,121,165,0.15)` — a lavender-tinted bloom that signals readiness.

### Named Rules
**The Purposeful Glass Rule.** Every `backdrop-filter: blur()` in the UI has a structural job: separating one layer from the ambient background. If removing the blur doesn't change the perceived hierarchy, it doesn't belong.

**The No-Nested-Glass Rule.** Glass cards are never nested inside other glass cards. When a card already has `backdrop-filter`, its children use opaque or transparent backgrounds only.

## 5. Components

### Buttons
Two circular icon buttons anchor all primary interaction; text-label buttons are rare.

- **Shape:** Fully circular (9999px) for icon buttons; pill (9999px) for any text actions.
- **Primary (Submit):** Ink (#2D3436) fill, white ArrowRight icon, 44×44px, 1px #374649 border. Scales to 105% on hover with `ease-out`. No label — the directional icon is the only affordance needed.
- **Voice (Mic):** White fill, 1px rgba(0,0,0,0.05) border, Stone 700 mic icon, 44×44px. Hovers to Lavender Tint (#E8E1F2). Mic icon pulses at 2s to signal readiness. On capture, the icon swaps to a stop state.
- **Ghost:** Transparent fill, Stone 700 text, xl radius (12px). Back navigation and secondary actions only.

### Chips
- **Suggestion Chips:** white/40% fill, 1px white/60% border, Ink text, full-pill radius (30px+), Body Sans 14px. On hover: white fill, -2px lift. These chips are the only prompt-entry affordance on the welcome screen; they carry real content, not decorative labels.

### Cards / Containers
- **Glass Card:** white/55%, blur 12px, 1px white/80% border, 2xl radius (16px), 24px internal padding. The workhorse container for all coaching content sections.
- **Soma Container (welcome screen):** max-w-2xl centered, no card surface — the welcome screen uses the ambient background as its canvas. The Soma input floats directly on the gradient.

**The No-Nested-Glass Rule applies here.** No glass card inside a glass card, ever.

### Inputs / Fields
- **Soma Input Capsule:** The primary interaction object. Full-width pill (9999px), white/60% fill, blur 20px, 1px white/80% border, 14px vertical / 24px left padding. On hover or focus-within: white/80%, white border, lavender-tinted shadow bloom. Contains the text field, voice button, and submit button as a unified cluster. No focus ring — the hover/focus state IS the visible affordance at this scale.
- **No standalone form fields exist in the current UI.** All input flows through the Soma capsule or the VoiceModal.

### Navigation
- **Top bar:** Transparent background, Logo left, Tab switcher center-right. No border, no shadow. Collapses to column stack on small screens.
- **Tab Switcher:** white/40%, 1px white/60% border, 2xl outer radius, 4px inner padding. Active tab: Lavender/90% fill, white Label text. Inactive: transparent, Stone 500 Label text. The switcher is the only persistent nav element.

### Signature Components
- **Soma Input Capsule:** The hero interaction object. The three-element cluster (field + mic + submit) is visually unified within one pill surface — same internal padding, shared glass background. The capsule is the product's face.
- **Ambient Loading Lotus:** A centered SVG lotus that breathes (`scale 1→1.45→1`, 3.5s ease-in-out) while the AI synthesizes. One outer ring expands and fades in sync. Animation stops the moment the response arrives — it is not a looping idle state.
- **Breathwork Timer:** Mono 200 at 72px. Stands alone in its own glass card. The Timer register is used nowhere else in the system. The countdown display is accompanied by Body Serif Quote copy naming the pranayama and its ratio.

## 6. Do's and Don'ts

### Do:
- **Do** use Sacred Lavender (#8A79A5) for active states, labels, and brand moments only — its scarcity signals importance.
- **Do** use Playfair Display in sentence case for all display and heading text, including italic emphasis.
- **Do** reserve the mono uppercase Label register for instrument-readout contexts: badge text, tab labels, section markers, chip text, and metadata lines only.
- **Do** pair every breathing or ambient animation with a `@media (prefers-reduced-motion: reduce)` fallback — typically an instant crossfade or opacity transition.
- **Do** maintain the glass hierarchy: inputs at white/60%, primary cards at white/55%, nav and chips at white/40%.
- **Do** cap Body Serif text at 65ch and Body Sans at 70ch. Apply `text-wrap: balance` to Display and Heading elements.
- **Do** use the four dosha tints semantically — only in coaching contexts where a dosha state is explicitly identified by the AI.

### Don't:
- **Don't** use generic SaaS or dashboard patterns: no metric hero cards with big numbers and small stat labels, no persistent sidebar navigation, no layouts with multiple competing primary CTAs.
- **Don't** use fast-energy or gym-app motion: no bounce easing, no staggered section entrances with identical timing applied to every section, no urgency-signaling countdowns outside the breathwork timer.
- **Don't** make the UI feel like a chat interface or AI conversation thread. Coaching outputs are structured ritual compositions — complete, beautiful, and presented as a whole — never as conversational bubbles or streamed tokens.
- **Don't** use fantasy or mystical visual language: no temple imagery, sacred geometry overlays, mandala backgrounds, glowing orbs, or heavy spiritual iconography. These compete with product content and undermine the intelligent register.
- **Don't** use glassmorphism decoratively. Every `backdrop-filter: blur()` must have a structural hierarchy job. Decorative blur is banned.
- **Don't** nest glass cards inside glass cards. The No-Nested-Glass Rule is absolute.
- **Don't** use gradient text (`background-clip: text` + gradient `background`). Emphasis is conveyed through weight or size — never through gradient.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe accent on any card, list item, or callout.
- **Don't** uppercase Playfair Display at any size. Uppercase is the mono register's territory only.
