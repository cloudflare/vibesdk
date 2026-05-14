/**
 * UI Pattern Corpus — Mobbin-inspired pattern reference for blueprint generation.
 *
 * A curated catalog of ~70 common app UI patterns, organized by category.
 * Each pattern specifies layout, interactions, and key variants so the blueprint
 * LLM can reference named, concrete patterns rather than hallucinating generic ones.
 *
 * Injection strategy: patterns are surfaced selectively via getUiPatternHints()
 * based on the current use case — avoiding full-corpus context inflation.
 *
 * Pattern format per line:
 *   **Name** — layout | interaction | variants/notes
 *
 * S10 — Cycle 5 finding: Mobbin MCP (621k screens) released April 2026.
 * This static corpus delivers zero-cost equivalent for vibesdk's top use cases.
 */

// ── Auth & Onboarding ─────────────────────────────────────────────────────────

export const AUTH_PATTERNS = `
### Auth & Onboarding Patterns
**Split-Screen Sign In** — left: brand illustration (bg-primary, 40vw, hidden sm:flex), right: centered card (max-w-sm, gap-6) with logo, heading, social OAuth buttons, email/password fields, forgot-password link. Submit button full-width bg-primary.
**Centered Card Auth** — single card (max-w-md mx-auto mt-20, p-8, shadow-lg rounded-2xl) on muted bg. Logo top-center, h2 heading, subtitle, form, terms footnote.
**Modal Auth (overlay)** — Dialog from shadcn/ui, 480px wide. Tabs (Sign In / Sign Up). Animated tab content switch. Close X top-right. Trap focus. Dismiss on backdrop click.
**Social-First Auth** — OAuth buttons stacked (Google, GitHub, Apple) in Card. Divider "or continue with email". Collapsible email form below. Reduces friction for social-heavy apps.
**Multi-Step Onboarding Wizard** — ProgressBar (step N of M) at top. Each step: left sidebar (step list, check icons for completed), right: form panel. Back/Next navigation. Final step: confetti or success animation.
**Welcome Screen** — full-viewport hero (bg-gradient). Centered content: product logo (64px), headline, subtext, two CTAs (primary + ghost). Skip link top-right for returning users.
**Email Verification Gate** — centered illustration (envelope icon, 120px), h2 "Check your email", body copy with masked email, Resend button with 60s cooldown timer, Back to sign in link.
**Forgot Password Flow** — Step 1: email input + Submit. Step 2: "Email sent" confirmation with masked address. Step 3 (from link): new password + confirm + strength meter + Submit.
`;

// ── Navigation Shells ─────────────────────────────────────────────────────────

export const NAV_PATTERNS = `
### Navigation Shell Patterns
**Fixed Topnav + Content** — header (h-16, bg-background, border-b, sticky top-0 z-40): logo left, nav links center (hidden on mobile), avatar/actions right. Content: max-w-7xl mx-auto px-4 py-8. Mobile: hamburger → Sheet side drawer.
**Collapsible Sidebar App Shell** — sidebar (w-64, bg-sidebar, h-screen, fixed) with logo, grouped nav links (NavGroup labels + NavItem with icon+label). Main content ml-64. Sidebar collapses to icon-only (w-16) on toggle. Uses shadcn/ui Sidebar or custom.
**Bottom Tab Bar (mobile-first)** — fixed bottom-0 w-full h-16 bg-background border-t. 4-5 icon+label tabs, active tab: text-primary underline or filled icon. Safe-area-inset-bottom padding for iOS.
**Breadcrumb Trail** — flex row gap-1 text-sm. Items: text-muted-foreground hover:text-foreground. Separator: / or ChevronRight (14px). Last item: text-foreground font-medium. Truncate on mobile to "… > Parent > Current".
**Tab Navigation Bar** — Tabs (shadcn/ui) below page heading. Tab triggers: border-b-2 border-transparent aria-selected:border-primary. Content panels with enter animation (opacity 0→1, translateY 4px→0).
**Mega Menu Dropdown** — TopNav link triggers popover (min-w-[600px], p-6, shadow-xl). Grid 3-cols: left column: featured item (icon+title+desc), center+right: categorized link lists. Keyboard navigable.
`;

// ── Dashboard & Analytics ─────────────────────────────────────────────────────

export const DASHBOARD_PATTERNS = `
### Dashboard & Analytics Patterns
**Metric KPI Row** — 4-col grid (2-col sm, 4-col lg). Each Card: icon top-right (text-muted-foreground/50), value (text-3xl font-bold), label (text-muted-foreground text-sm), delta badge (green/red arrow + %). Hover: shadow-md transition.
**Time-Series Chart Panel** — Card with header (title left, period selector right). recharts AreaChart or LineChart. Tooltip on hover. Legend below. Loading: skeleton 200px height. Empty: dashed border + "No data yet" centered.
**Donut / Pie Breakdown** — recharts PieChart (innerRadius 60, outerRadius 90). Legend list right side: color swatch + label + value + percent. Total in donut center (absolute position). Click slice to filter table below.
**Stats Table With Sparklines** — Table: col(name), col(metric), col(7-day sparkline, recharts 60×24 LineChart), col(change badge), col(actions). Sortable columns. Pagination or infinite scroll.
**Activity Feed** — Scrollable list. Each item: avatar (32px), bold actor, action text, target (link), relative timestamp. Grouped by date (sticky date header). Load more button or IntersectionObserver for auto-load.
**Heatmap Calendar** — 53-col × 7-row grid (GitHub-style). Each cell: w-3 h-3 rounded-sm bg-muted → bg-primary at 4 intensity levels. Tooltip on hover: date + count. Month labels above. Week labels left.
**Real-Time Live Counter** — Card with pulsing green dot, large number, "active now" label. Number animates on change (countUp). WebSocket or SSE powered. Last-updated timestamp.
**Funnel Visualization** — Vertical or horizontal bar sequence. Each stage: label, count, conversion rate from previous, color-coded fill (100%→0% = primary→muted). Click stage to drill down.
`;

// ── Data Tables & Lists ───────────────────────────────────────────────────────

export const TABLE_PATTERNS = `
### Data Tables & List Patterns
**Filterable Data Table** — sticky header row (bg-muted/50). Toolbar above: search Input (left), filter Selects + status Badges (center), export/action Buttons (right). Row checkbox (multi-select). Bulk-action bar appears when rows selected. Pagination footer.
**Kanban Board** — flex row of columns (min-w-[280px], max-w-[320px]). Each column: header (title + count badge + add button), ScrollArea of Cards. Cards: title, avatar, due date chip, priority dot. Drag-and-drop reorder (via dnd-kit).
**Grouped List With Sections** — sticky section headers (text-xs uppercase text-muted-foreground, border-b). Items below each header. Right-swipe on mobile: reveal delete/archive action. Keyboard: arrow keys + enter to select.
**Virtualized Long List** — react-window FixedSizeList or VariableSizeList. Row: avatar, title, subtitle, timestamp, status chip, 3-dot menu. IntersectionObserver at bottom for paginated fetch. Skeleton rows during load.
**Combobox Multi-Select** — Popover + CommandInput + CommandList. Selected items appear as Badges above input (with × to remove). Checkbox per item. Select all / clear all. Keyboard: type to filter, arrow to navigate, space to toggle, Enter to close.
**Timeline (vertical)** — Center or left-aligned line. Each node: icon (circle, primary), title, date, body text. Connector line between nodes. Alternating left/right layout on desktop, single-column on mobile.
`;

// ── Forms & Input ─────────────────────────────────────────────────────────────

export const FORM_PATTERNS = `
### Forms & Input Patterns
**Settings Form With Save** — Card or borderless sections. Each field: Label (font-medium) + Input/Select/Textarea + helper text (text-muted-foreground text-xs). Validation: red border + error message below. Footer sticky: Cancel + Save (disabled until dirty). Unsaved-changes warning on navigate.
**Multi-Step Form Wizard** — ProgressBar or numbered step indicators. Each step animates in (slide from right). Fields grouped logically per step. Summary/review step before submit. Back button retains entered data.
**File Dropzone** — dashed border (border-2 border-dashed border-muted-foreground/30) rounded-xl. Center: upload icon + "Drag & drop or click to upload". On dragover: border-primary bg-primary/5. File list below: name, size, progress bar, remove icon.
**Rich Text Editor** — Tiptap or Quill. Toolbar: bold, italic, link, code, blockquote, lists, headings. Output: HTML or Markdown. Character/word count footer. Auto-save with status indicator.
**Inline Editable Field** — Static text with edit pencil icon on hover. Click → transforms to Input with current value. Blur or Enter: save + optimistic update. Escape: cancel. Loading spinner while saving.
**Tag Input** — Input that grows horizontally. Space/comma/Enter = add tag as Badge. Backspace removes last tag. Autocomplete suggestions dropdown. Max tag count enforced. Tags truncate with +N more.
**Search With Suggestions** — Input with magnifier icon. Debounced search (300ms). Dropdown (max-h-64, overflow-y-auto): grouped results (Recent, Top results), each item: icon + title + subtitle, keyboard navigable. No-results state.
**Date Range Picker** — Two calendars side-by-side (desktop) or stacked (mobile). Pre-set ranges: Today, Last 7 days, This month, Custom. Selected range highlighted with start/end anchors. Apply + Cancel buttons.
`;

// ── E-Commerce ────────────────────────────────────────────────────────────────

export const ECOMMERCE_PATTERNS = `
### E-Commerce Patterns
**Product Grid With Filters** — Left sidebar (hidden on mobile → Sheet): filter groups (collapsible AccordionItems) — price range Slider, checkboxes for attributes. Main: 3-col grid (2-col sm, 4-col xl). Product card: image (aspect-square object-cover), name, price, rating stars, add-to-cart. Mobile: filter in bottom Sheet.
**Product Detail Page** — Split: image gallery left (main + thumbnail strip), info right. Info: brand breadcrumb, title (h1), price (large), rating + review count, variant selectors (color swatches, size buttons), quantity stepper, CTA (Add to Cart full-width primary, wishlist ghost). Below the fold: tabs (Description, Reviews, Specs).
**Cart Sidebar (Sheet)** — shadcn/ui Sheet from right. Item list: image thumbnail, name, variant, quantity stepper, remove button, line price. Sticky footer: subtotal, shipping note, CTA "Proceed to Checkout" + secondary "Continue Shopping". Badge on cart icon shows count.
**Checkout Steps** — Step 1: Shipping address form. Step 2: Shipping method selector (radio cards with price/ETA). Step 3: Payment (Stripe Elements card input). Step 4: Review & place order (read-only summary + edit links). Order confirmation page with number + email copy.
**Order History Table** — sortable columns: order #, date, items (thumbnail stack), status (Badge: Processing/Shipped/Delivered), total. Click row → order detail page: line items, tracking number, timeline, invoice download.
**Promo Code Input** — Collapsible "Have a promo code?" link → reveals Input + Apply button. On success: badge "SAVE20" with × to remove, discount line in summary. On fail: red error inline.
`;

// ── SaaS & Settings ───────────────────────────────────────────────────────────

export const SAAS_PATTERNS = `
### SaaS & Settings Patterns
**API Keys Management** — Table: key name, prefix (sk_live_...****), created date, last used, scopes, revoke button. "Create new key" → Dialog: name input, scope checkboxes, Confirm. After creation: one-time reveal with copy button and warning.
**Team Members Panel** — Table: avatar + name, email, role Select (Owner/Admin/Member), status Badge (Active/Pending), remove button. Footer: "Invite member" button → Sheet with email input + role selector + Send Invite.
**Usage & Quota Meter** — Per feature: label, ProgressBar (usage/limit), "X of Y used" text. Over-quota: bar turns red, upgrade nudge badge. Tooltip on hover: resets on (date). Link to upgrade plan.
**Billing Plan Cards** — 3-col grid (1-col mobile). Each card: plan name, price (large), billing period toggle (monthly/annual with annual saving badge), feature list (check icons), CTA. Current plan: highlighted border-primary, "Current Plan" label. Popular: Badge "Most Popular" top-right.
**Notification Preferences** — Grouped by category (Email, Push, In-App). Each row: description left, Switch right. Section headers styled. Master "Disable all" toggle at top. Saved state with toast confirmation.
**Webhook Endpoints** — Table: URL, events (Badge stack), status (Active/Failing), last triggered, test button, edit/delete. "Add endpoint" → Sheet: URL input, event type checkboxes (grouped), secret display.
**Feature Flags / Admin Panel** — Table: flag name, description, environment Select, enabled Switch, rollout % Slider (if % rollout). Filter by enabled/disabled. Audit log link per flag.
**Audit Log** — Table with filters (actor, action type, date range). Columns: timestamp, actor (avatar+name), action (Badge), resource, IP. Row expand for full JSON diff. Export CSV button.
`;

// ── Empty & Loading States ────────────────────────────────────────────────────

export const STATE_PATTERNS = `
### Empty & Loading State Patterns
**Skeleton Screen** — Exact structure of real content, but cells replaced with Skeleton (shadcn/ui). Pulse animation. Matches real layout column-by-column. Never show spinner where skeleton fits.
**Empty State With CTA** — Centered vertically in container. Illustration (SVG or Lucide icon, 80px, text-muted-foreground/30). h3 "No items yet". p description. Primary CTA button. Optional: secondary link to docs.
**Error State With Retry** — Alert icon (red, 48px). "Something went wrong" heading. Error message (truncated, expand link). "Try again" Button (outline). "Report issue" link. If 404: illustration + "Not found" + back link.
**Loading Spinner Overlay** — Semi-transparent overlay (bg-background/80) over loading region. Center: Loader2 (animate-spin, 32px, text-primary). For page-level: full-screen. For card-level: absolute inset-0.
**Progressive Loading** — Above-fold content renders immediately. Below-fold uses IntersectionObserver to trigger fetch. Skeleton fills placeholder until data arrives. No layout shift (reserve height with min-h).
**Success State** — CheckCircle icon (green, 64px, animate from scale-0). "Done!" heading. Brief description. Auto-redirect countdown or manual "Continue" button. Confetti optional for high-value actions.
`;

// ── Cards & Content ───────────────────────────────────────────────────────────

export const CARD_PATTERNS = `
### Cards & Content Patterns
**Media Card** — aspect-video thumbnail (object-cover, rounded-t-lg). Body: author avatar + name (text-sm), title (font-semibold, 2-line clamp), description (3-line clamp, text-muted-foreground), tag Badges, timestamp. Footer: action buttons (like, comment, share).
**Pricing Feature List** — Check icon (text-primary, 16px) + label (text-sm) per feature. Strikethrough items (text-muted-foreground, line-through) for unavailable features. Tooltip on hover for locked features.
**Testimonial Card** — Quote mark icon top-left (text-primary/20, 40px). Body text (italic). Footer: avatar + name (bold) + role + company. Star rating above quote. Carousel or masonry grid layout.
**Profile / Person Card** — Cover image top (h-20, object-cover). Avatar overlapping (-mt-10, ring-4 ring-background). Name h3 + role p. Stats row (followers, following, posts). Action buttons (Follow, Message). Hover: slight lift shadow-lg.
**Feature Highlight Card** — Icon (48px, bg-primary/10 rounded-lg p-3). Heading (font-semibold). Description (text-muted-foreground). Optional "Learn more →" link. Grid 2-3 cols on desktop.
**Notification Toast** — shadcn/ui Sonner or Toaster. Types: success (green), error (red), warning (yellow), info (blue). Auto-dismiss (4s). Queue up to 3. Action button optional. Stack from bottom-right.
`;

// ── Mobile Patterns ───────────────────────────────────────────────────────────

export const MOBILE_PATTERNS = `
### Mobile-First Patterns
**Pull-to-Refresh** — Custom indicator at top (appears on over-scroll). Spinner + "Release to refresh" text. Haptic feedback simulation. Triggers data refetch on release.
**Swipe Actions on List Item** — Left swipe: reveal destructive action (red bg, trash icon). Right swipe: reveal affirmative action (green bg, archive icon). Snap-back on partial swipe.
**Bottom Sheet (Action Sheet)** — Slides up from bottom (Sheet from shadcn). Handle bar at top. Actions stacked as large tap-targets (min-h-12). Destructive actions in red at bottom. Cancel button always last.
**Sticky Summary Bar** — Fixed bottom-0 bar during long forms or checkout. Shows running total or key selection. "Continue" CTA full-width. Appears after user scrolls past fold.
**Floating Action Button (FAB)** — fixed bottom-6 right-6. Circle button (w-14 h-14) with primary action icon. Shadow-lg. Optional speed-dial: tap to expand 2-4 secondary FABs with labels.
**Infinite Scroll With Pull-to-Refresh** — IntersectionObserver at list bottom triggers fetchNextPage. Loading spinner row at bottom. Pull-to-refresh resets to page 1. "You're all caught up" message at end.
`;

// ── Corpus Map ────────────────────────────────────────────────────────────────

/** Map from use-case key to relevant pattern category constants. */
const CORPUS_MAP: Record<string, string[]> = {
    auth: [AUTH_PATTERNS, FORM_PATTERNS],
    dashboard: [DASHBOARD_PATTERNS, TABLE_PATTERNS, NAV_PATTERNS, STATE_PATTERNS],
    ecommerce: [ECOMMERCE_PATTERNS, FORM_PATTERNS, CARD_PATTERNS, STATE_PATTERNS],
    saas: [SAAS_PATTERNS, AUTH_PATTERNS, FORM_PATTERNS, NAV_PATTERNS],
    'saas-payments': [SAAS_PATTERNS, AUTH_PATTERNS, FORM_PATTERNS, CARD_PATTERNS],
    landing: [CARD_PATTERNS, NAV_PATTERNS, STATE_PATTERNS],
    general: [NAV_PATTERNS, CARD_PATTERNS, STATE_PATTERNS, FORM_PATTERNS],
    mobile: [MOBILE_PATTERNS, NAV_PATTERNS, STATE_PATTERNS],
};

/** Deduplicate sections by reference equality to avoid duplicate blobs. */
function dedupePatterns(sections: string[]): string[] {
    const seen = new Set<string>();
    return sections.filter((s) => {
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
    });
}

/**
 * Returns the UI pattern hints relevant for the given use-case keys.
 *
 * @param keys - One or more use-case keys from CORPUS_MAP.
 * @returns A combined string of pattern sections, or empty string if no match.
 */
export function getUiPatternHints(keys: string[]): string {
    const sections: string[] = [];
    for (const key of keys) {
        const mapped = CORPUS_MAP[key.toLowerCase()];
        if (mapped) sections.push(...mapped);
    }
    const unique = dedupePatterns(sections);
    if (unique.length === 0) return '';
    return `\n## UI Pattern Reference (select patterns relevant to your blueprint)\n${unique.join('\n')}`;
}

/**
 * Maps a TemplateSelection useCase string to corpus key(s).
 */
export function useCaseToCorpusKeys(useCase: string | null | undefined): string[] {
    if (!useCase) return ['general'];
    const map: Record<string, string[]> = {
        'SaaS Product Website': ['landing', 'auth'],
        'SaaS with Payments': ['saas-payments', 'auth'],
        Dashboard: ['dashboard'],
        'E-Commerce': ['ecommerce'],
        Blog: ['general', 'landing'],
        Portfolio: ['landing', 'general'],
        General: ['general'],
        Other: ['general'],
    };
    return map[useCase] ?? ['general'];
}
