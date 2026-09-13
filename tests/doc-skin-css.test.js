import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const electronDir = fileURLToPath(new URL("../electron/", import.meta.url));
const docFormHtml = readFileSync(join(electronDir, "doc-form.html"), "utf8");
const billFormPage = readFileSync(
  join(fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url))),
  "utf8",
);
const docFormPage = readFileSync(
  join(fileURLToPath(new URL("../src/doc-form-page.js", import.meta.url))),
  "utf8",
);
const docSkinCss = readFileSync(join(electronDir, "doc-skin.css"), "utf8");
const billDashboardCss = readFileSync(join(electronDir, "bill-dashboard.css"), "utf8");
const docFieldsCss = readFileSync(join(electronDir, "doc-fields.css"), "utf8");

describe("doc-skin.css shared chrome", () => {
  it("is linked from doc-form shell (Bill + PO/IR)", () => {
    assert.match(docFormHtml, /href="doc-skin\.css"/);
    assert.match(docFormHtml, /href="bill-dashboard\.css"/);
  });

  it("defines toolbar, dirty pill, commit gate, memo, and link picker", () => {
    assert.match(docSkinCss, /\.toolbar\s*\{/);
    assert.match(docSkinCss, /\.dirty-pill\s*\{/);
    assert.match(docSkinCss, /\.commit-gate\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    assert.match(docSkinCss, /\.memo-head\s*\{/);
    assert.match(docSkinCss, /\.link-dd\s*\{/);
    assert.match(docSkinCss, /\.blocked input:not\(\[readonly\]\)/);
  });

  it("does not duplicate commit-gate rules inline in shells", () => {
    assert.doesNotMatch(docFormHtml, /\.commit-gate\s*\{[^}]*position:\s*fixed;/s);
    assert.doesNotMatch(billDashboardCss, /\.commit-gate\s*\{[^}]*position:\s*fixed;/s);
    assert.doesNotMatch(docFormHtml, /\.src-back\s*\{/);
  });
});

describe("doc-fields.css shared field/layout CSS (Packet 4b step 1, 2026-09-05)", () => {
  it("is linked from doc-form shell, before bill-dashboard.css (business logic, 2026-09-06)", () => {
    // bill-dashboard.css loads LAST, deliberately: it is not only a Doc skin for a
    // transaction-entry form, it is also the dashboard for the individual voucher-packet
    // controls (the Bill is the final approval act of that packet) -- 5zorro's framing.
    // That role means it is *expected* to override a shared doc-fields.css rule on
    // purpose sometimes, not just inherit it. (An earlier pass here flipped this order
    // to make redefinition impossible, treating any override as a bug to prevent --
    // wrong call, reverted the same day once the actual business rule was stated.)
    // What still isn't licensed is *undocumented* drift (a rule silently diverging
    // because nobody knew there were two copies) -- that's a review/authorship problem,
    // not a cascade-order one, and doesn't have an automated guard here; see the
    // Packet 4b step-1 commit's 6-selector drift for what that looked like in practice.
    const links = [...docFormHtml.matchAll(/href="([\w.-]+\.css)"/g)].map((m) => m[1]);
    assert.deepEqual(links, ["doc-wash.css", "doc-skin.css", "doc-fields.css", "bill-dashboard.css"]);
  });

  it("defines the component vocabulary the check/ACH document (Packet 4b) will reuse", () => {
    assert.match(docFieldsCss, /\.card\s*\{/);
    assert.match(docFieldsCss, /\.field\s*\{/);
    assert.match(docFieldsCss, /\.cols\s*\{/);
    assert.match(docFieldsCss, /\.taxes-table\s*\{/);
    assert.match(docFieldsCss, /\.money-stack\s*\{/);
  });

  it("keeps its two responsive rules media-scoped, not promoted to unconditional overrides", () => {
    // Regression guard: an earlier consolidation pass extracted these two rules'
    // inner text without their @media wrapper, which would have made .addr-grid
    // and .cols permanently single-column at every viewport width, not just narrow
    // ones. Caught by parse-back verification before it ever reached this file.
    assert.match(
      docFieldsCss,
      /@media \(max-width:\s*900px\)\s*\{\s*\.addr-grid\s*\{\s*grid-template-columns:\s*1fr;\s*\}\s*\}/,
    );
    assert.match(
      docFieldsCss,
      /@media \(max-width:\s*720px\)\s*\{\s*\.cols\s*\{\s*grid-template-columns:\s*1fr;\s*\}\s*\}/,
    );
    // And the un-scoped, multi-column base rules must still stand alone (not
    // themselves accidentally wrapped in a media query).
    assert.match(docFieldsCss, /^\.cols \{ display: grid;/m);
    assert.match(docFieldsCss, /^\.addr-grid \{\n {2}display: grid;/m);
  });

  it("does not duplicate the field/card/cols vocabulary inline in doc-form.html", () => {
    assert.doesNotMatch(docFormHtml, /<style>/);
  });
});

describe("Packet T — line-grid readability CSS (2026-09-06)", () => {
  it("A1: line + tax sections bleed to the viewport, scrollbar-safe", () => {
    // The document column (.wrap, max-width 1100px) still governs header /
    // addresses / totals / notes; only the two line grids break out.
    assert.match(docFieldsCss, /\.bill-section-lines,\s*\n\.bill-section-taxes \{/);
    assert.match(docFieldsCss, /width: calc\(100vw - var\(--doc-bleed-gutter\)\);/);
    assert.match(
      docFieldsCss,
      /margin-inline: calc\(50% - 50vw \+ \(var\(--doc-bleed-gutter\) \/ 2\)\);/,
    );
  });

  it("A1: the gutter variable has a 0px fallback so CSS alone stays correct", () => {
    // If the JS wiring never runs (or throws), the bleed must still be sane --
    // 0px just means it reaches the scrollbar edge instead of stopping short.
    assert.match(docFieldsCss, /--doc-bleed-gutter:\s*0px;/);
  });

  it("A1: does not disturb the padding .line-tabs' negative pull depends on", () => {
    // .bill-section .line-tabs uses margin: -12px -14px 0 to reach the section
    // edges. Changing the sections' inline padding would silently unhook that.
    assert.match(billDashboardCss, /\.bill-section \{[^}]*padding: 12px 14px 14px;/s);
    assert.doesNotMatch(docFieldsCss, /\.bill-section-(lines|taxes)[^{]*\{[^}]*padding-inline:/s);
  });
});

describe("Packet T step B — display layer (2026-09-06)", () => {
  it("gives the resting text layer a real break opportunity", () => {
    // A long unbroken item code has none of its own; without `anywhere` it
    // would dictate the column width instead of wrapping inside it.
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*overflow-wrap: anywhere;/s);
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*white-space: pre-wrap;/s);
  });

  it("sizes the text layer border-box so short rows keep their height", () => {
    // Regression: with content-box, min-height + padding stack and every short
    // row grows ~11px. Measured 40 -> 51 -> 40 when this was added.
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*box-sizing: border-box;/s);
  });

  it("overlays both editor shapes — a bare input and the picker's .link-wrap", () => {
    // mountLinkPicker() inserts a positioned .link-wrap between the td and the
    // input for item_code, so targeting only `input` would miss precisely the
    // column with the worst readability problem.
    assert.match(docFieldsCss, /td\.cell-wrap > input,\s*\ntd\.cell-wrap > \.link-wrap \{/);
    assert.match(
      docFieldsCss,
      /td\.cell-wrap:focus-within > input,\s*\ntd\.cell-wrap:focus-within > \.link-wrap \{\s*opacity: 1;/,
    );
  });

  it("keeps the wrapped text readable in nav mode", () => {
    // Nav mode is for moving, not typing: the editor stays transparent so you
    // can still read the cell you are sitting on.
    assert.match(
      docFieldsCss,
      /\[data-cell-mode="nav"\] td\.cell-wrap:focus-within > input,[\s\S]*?opacity: 0;/,
    );
  });

  it("makes the cell mode visible (the old dead data-nav-focus job)", () => {
    assert.match(docFieldsCss, /td\.cell-wrap:focus-within \{[^}]*outline: 2px solid/s);
    assert.match(docFieldsCss, /\[data-cell-mode="nav"\] td\.cell-wrap:focus-within \{[^}]*background:/s);
  });

  it("both row builders emit the display layer, and keep their testids", () => {
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      const prefix = label === "bill" ? "bill" : "doc";
      assert.match(
        src,
        new RegExp(`<td class="cell-wrap"><span class="cell-text">\\$\\{escapeHtml\\(val\\)\\}</span>`),
        `${label} row builder lost its text layer`,
      );
      assert.match(
        src,
        new RegExp(`data-testid="${prefix}-cell-\\$\\{ri\\}-\\$\\{col\\.field\\}"`),
        `${label} row builder lost its cell testid`,
      );
    }
  });

  it("read-only cells wrap too — reading a submitted doc is still reading", () => {
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(
        src,
        /<td class="cell-wrap"><span class="cell-text ro">/,
        `${label} read-only branch does not wrap`,
      );
    }
  });

  it("mirrors the cell mode to the DOM through a single setter", () => {
    // The mode used to live only in a module-local variable, so no stylesheet
    // could see it. Every assignment must go through the setter or the CSS
    // silently desyncs from the real mode.
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(src, /function setItemCellMode\(mode\) \{/, `${label} has no setter`);
      assert.match(src, /el\.items\.dataset\.cellMode = itemCellMode;/, `${label} does not mirror`);
      // Only the setter itself may assign the variable directly.
      const direct = [...src.matchAll(/^\s*itemCellMode = /gm)];
      assert.equal(direct.length, 1, `${label} has ${direct.length} raw itemCellMode assignments`);
    }
  });
});

describe("Packet T step D — frozen columns and density CSS (2026-09-06)", () => {
  it("frozen cells get an opaque ground", () => {
    // Without one the scrolled columns show straight through the frozen group.
    assert.match(
      docFieldsCss,
      /#panel-items table\[data-sticky-count\] tbody td:nth-child\(-n \+ 3\) \{\s*background: #fff;/,
    );
    assert.match(
      docFieldsCss,
      /#panel-items table\[data-sticky-count\] thead th:nth-child\(-n \+ 3\) \{\s*background: #f8fafc;/,
    );
  });

  it("each frozen column reads its offset from step C, falling back to auto", () => {
    for (const n of [1, 2, 3]) {
      assert.match(
        docFieldsCss,
        new RegExp(`left: var\\(--sticky-${n}, auto\\);`),
        `column ${n} has no sticky offset`,
      );
    }
  });

  it("standard density is the unstyled default", () => {
    // Only compact and comfortable override anything; "standard" existing as a
    // rule would mean the default path could drift from the default look.
    assert.doesNotMatch(docFieldsCss, /\[data-density="standard"\]/);
    assert.match(docFieldsCss, /\[data-density="compact"\]/);
    assert.match(docFieldsCss, /\[data-density="comfortable"\]/);
  });

  it("every density still wraps — the toggle is never needed to read", () => {
    // The wrap rules live on td.cell-wrap > .cell-text unconditionally; density
    // may only change padding/min-height/line-height.
    const densityRules = docFieldsCss.match(/\[data-density="(compact|comfortable)"\][^{]*\{[^}]*\}/gs) || [];
    assert.ok(densityRules.length > 0, "no density rules found");
    for (const rule of densityRules) {
      assert.doesNotMatch(rule, /white-space:/, `a density rule changes wrapping: ${rule}`);
      assert.doesNotMatch(rule, /overflow-wrap:/, `a density rule changes wrapping: ${rule}`);
    }
  });

  it("the density control ships in the generated shell for both bodies", () => {
    assert.match(docFormHtml, /data-testid="bill-density"/);
    assert.match(docFormHtml, /data-testid="doc-density"/);
  });
});

describe("doc-form CAPS control", () => {
  it("exposes CAPS toggle in Navigate toolbar", () => {
    assert.match(docFormHtml, /id="btn-caps" data-testid="doc-caps"/);
  });
});

describe("bill-dashboard subsection chrome", () => {
  it("defines borderless subsection inset on white bill-sections", () => {
    assert.match(billDashboardCss, /\.bill-section \.field input\.addr-pick/);
    assert.match(billDashboardCss, /box-shadow:/);
  });

  it("PO doc-form shell uses bill-section doc header wrapper", () => {
    assert.match(docFormHtml, /data-testid="doc-header-section"/);
    assert.match(docFormHtml, /bill-section-doc/);
    assert.match(docFormHtml, /data-testid="doc-notes-section"/);
  });
});

/**
 * Regression guard for a real defect class, found 2026-09-07 on the Packet 4b surfaces.
 *
 * An author `display:` declaration beats the UA stylesheet's `[hidden] { display: none }`,
 * so an element that carries a `display` rule does NOT hide when code sets `el.hidden = true`.
 * It shipped twice: `.check-doc-write-actions` (a "Create & submit Payment Entry" button left
 * on screen over an already-submitted Payment Entry) and `.col-header-row` (column labels over
 * an empty list). Both passed their e2e checks because those asserted the `.hidden` *property*,
 * which was correctly `true` the whole time.
 */
const checkDocCss = readFileSync(join(electronDir, "check-doc.css"), "utf8");
const checkDocFragment = readFileSync(join(electronDir, "check-doc.fragment.html"), "utf8");
const payOutstandingSrc = readFileSync(join(electronDir, "pay-outstanding.src.html"), "utf8");
const paymentDocSrc = readFileSync(join(electronDir, "payment-doc.src.html"), "utf8");

/** Every element carrying a literal `hidden` attribute, as the id/class tokens it can be styled by. */
function hiddenAttrTokens(html) {
  /** @type {string[]} */
  const tokens = [];
  for (const m of html.matchAll(/<[a-z][\w-]*\b([^>]*)>/gi)) {
    const attrs = m[1];
    // Blank out attribute *values* first so a `hidden` inside one (data-testid="x-hidden")
    // can't be mistaken for the boolean attribute. `$` in the lookahead: the attribute is
    // often last, and the `>` that follows it is outside this capture group.
    const bare = attrs.replace(/="[^"]*"/g, (s) => " ".repeat(s.length));
    if (!/\shidden(?=[\s/>]|$)/i.test(bare)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs);
    if (id) tokens.push(`#${id[1]}`);
    const cls = /\bclass="([^"]+)"/.exec(attrs);
    if (cls) for (const c of cls[1].trim().split(/\s+/)) tokens.push(`.${c}`);
  }
  return [...new Set(tokens)];
}

/** Rules as [selectorList, declarations] pairs. Good enough for these hand-written sheets. */
function cssRules(css) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** Does a bare (unqualified) rule for `token` set `display`? */
function hasBareDisplayRule(css, token) {
  return cssRules(css).some(
    ([sel, decls]) =>
      /(^|[\s;])display\s*:/.test(decls) &&
      sel.split(",").some((part) => {
        const last = part.trim().split(/[\s>+~]+/).pop() || "";
        return last === token;
      }),
  );
}

/** Rough CSS specificity for one compound selector -- enough for these hand-written sheets. */
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls =
    (sel.match(/\.[\w-]+/g) || []).length +
    (sel.match(/\[[^\]]*\]/g) || []).length +
    (sel.match(/:(?!:)[\w-]+/g) || []).length;
  const el = (sel.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + cls * 100 + el;
}

/**
 * A guard only counts if it actually *wins*. `.x[hidden]` and `.parent .x` have identical
 * specificity, so a guard declared before the display rule silently loses the cascade -- which
 * is exactly what happened to .check-doc-payee (2026-09-08): the rule was present and the
 * element still rendered. More specific wins outright; equally specific has to come later.
 */
function hasHiddenGuard(css, token) {
  const rules = cssRules(css);
  /** @returns {{spec: number, i: number}|null} strongest rule matching `pred` */
  const strongest = (pred) =>
    rules.reduce((best, [sel, decls], i) => {
      const parts = sel.split(",").filter((part) => pred(part.trim(), decls));
      if (!parts.length) return best;
      const spec = Math.max(...parts.map((part) => specificity(part.trim())));
      return !best || spec > best.spec || (spec === best.spec && i > best.i) ? { spec, i } : best;
    }, null);

  const guard = strongest(
    (part, decls) => /display\s*:\s*none/.test(decls) && part.endsWith(`${token}[hidden]`),
  );
  if (!guard) return false;
  const display = strongest(
    (part, decls) =>
      /(^|[\s;])display\s*:/.test(decls) && (part.split(/[\s>+~]+/).pop() || "") === token,
  );
  if (!display) return true; // nothing to beat
  return guard.spec > display.spec || (guard.spec === display.spec && guard.i > display.i);
}

/** Inline <style> blocks plus every stylesheet the page links from electron/. */
function stylesFor(html) {
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const linked = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/gi)]
    .map((m) => {
      try {
        return readFileSync(join(electronDir, m[1]), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
  return `${linked}\n${inline}`;
}

describe("[hidden] survives author display rules (Packet 4b surfaces)", () => {
  const pages = [
    ["pay-outstanding.src.html", payOutstandingSrc, `${payOutstandingSrc}\n${checkDocFragment}`],
    ["payment-doc.src.html", paymentDocSrc, `${paymentDocSrc}\n${checkDocFragment}`],
  ];

  for (const [name, page, markup] of pages) {
    it(`${name}: every hidden-by-default element actually hides`, () => {
      const css = stylesFor(page);
      for (const token of hiddenAttrTokens(markup)) {
        if (!hasBareDisplayRule(css, token)) continue;
        assert.ok(
          hasHiddenGuard(css, token),
          `${name}: "${token}" sets display but has no "${token}[hidden]" guard — ` +
            `setting .hidden = true will not hide it`,
        );
      }
    });
  }

  // Toggled from JS only (check-doc-mount.js's read-only paint), so no `hidden` attribute in
  // the fragment for the scan above to find. Listed explicitly rather than by parsing JS.
  it("blank mode's swapped-out payee and amount actually disappear", () => {
    // paintCheckDoc sets .hidden on these to swap in the blank-mode inputs. .check-doc-payee
    // carries an author `display: block`, so it needs a guard (without it the span and the
    // input rendered on top of each other, found 2026-09-08); .check-doc-amount-box has no
    // display rule today and therefore does not — but it must stay that way, so assert the
    // condition rather than the current spelling.
    for (const token of [".check-doc-payee", ".check-doc-amount-box"]) {
      assert.ok(
        !hasBareDisplayRule(checkDocCss, token) || hasHiddenGuard(checkDocCss, token),
        `${token} sets display but has no "${token}[hidden]" guard`,
      );
    }
    assert.ok(hasBareDisplayRule(checkDocCss, ".check-doc-payee"), "premise moved: payee lost its display rule");
    assert.ok(hasHiddenGuard(checkDocCss, ".check-doc-payee"));
  });

  it("the payee link-picker wrapper hides with its input", () => {
    // mountLinkPicker wraps the payee input in a .link-wrap (display:flex, from doc-skin.css)
    // and adds a chevron beside it, so paintCheckDoc hides the wrapper. Without a guard the
    // orphan chevron rendered on the check face in every non-blank mode (found 2026-09-08).
    const combined = `${docSkinCss}\n${checkDocCss}`;
    assert.ok(hasBareDisplayRule(docSkinCss, ".link-wrap"), "premise moved: .link-wrap lost display");
    assert.ok(
      hasHiddenGuard(combined, ".link-wrap"),
      "no winning [hidden] guard for .link-wrap inside the check document",
    );
  });

  it("check-doc write actions hide on a read-only mount", () => {
    assert.ok(hasBareDisplayRule(checkDocCss, ".check-doc-write-actions"));
    assert.ok(
      hasHiddenGuard(checkDocCss, ".check-doc-write-actions"),
      "paintCheckDoc sets actions.hidden = true for an existing document; without a guard " +
        "the submit button stays visible over an already-submitted Payment Entry",
    );
  });

  it("the scan itself finds the elements it is meant to police", () => {
    const tokens = hiddenAttrTokens(`${payOutstandingSrc}\n${checkDocFragment}`);
    for (const expected of [".col-header-row", ".check-drawer", ".check-doc", "#prefs-panel"]) {
      assert.ok(tokens.includes(expected), `scan missed ${expected}`);
    }
  });
});

describe("flow nodes fit their span (Packet 4b, 2026-09-08)", () => {
  const css = stylesFor(payOutstandingSrc);

  it("an aggregate node clips rather than printing over the payment below", () => {
    // A node's height is member-count * ROW_HEIGHT because that is what lines the three columns
    // up and lands the ribbons on their rows -- so the node cannot grow, and content that does
    // not fit has to be dropped by density (src/flow-node-density.js) or clipped. Measured
    // 2026-09-08 without this: a one-bill suggested payment wanted 67px in a 34px box and 88 of
    // them overlapped their neighbour's text.
    for (const sel of [".invoice-node", ".group-node"]) {
      assert.ok(
        cssRules(css).some(
          ([selector, decls]) =>
            /overflow:\s*hidden/.test(decls) &&
            // Last token per comma part, like hasBareDisplayRule -- cssRules' selector capture
            // also swallows any preceding comment.
            selector.split(",").some((part) => (part.trim().split(/[\s>+~]+/).pop() || "") === sel),
        ),
        `${sel} needs overflow: hidden as the backstop for content that still does not fit`,
      );
    }
  });

  it("each density the pure module returns has a layout that fits it", () => {
    // Every density needs its own rule here, because each has a different amount of height to
    // spend: compact collapses to one line, medium puts the sub-line beside the button rather
    // than under it, and full is the plain stacked node.
    assert.ok(
      /\.group-node\.compact\s*\{/.test(css) && /\.invoice-node\.compact\s*\{/.test(css),
      "compact must collapse both node types",
    );
    assert.ok(
      /\.group-node\.medium \{[\s\S]*?grid-template-areas: "top top" "sub act";/.test(css),
      "medium must share its second line between the sub-line and the button",
    );
    assert.ok(
      /\.group-node\.compact \.group-sub \{ display: none; \}/.test(css),
      "only a one-row payment has to give up its sub-line",
    );
    assert.ok(
      /\.invoice-node\.compact \.invoice-sub \{ display: none; \}/.test(css),
      "a one-row invoice node has no room for its sub-line",
    );
  });

  it("Create payment keeps a word on it at every density", () => {
    // An unlabelled icon is the exact ambiguity the button was added to remove ("so it is clear
    // what clicking does"), so a one-row node shortens the label rather than dropping it -- it has
    // the width for a short one (measured: no clipping from 820px to 1440px, even with a
    // seven-figure amount).
    assert.match(
      payOutstandingSrc,
      /const actionLabel = plan\.density === "compact" \? "Pay" : "Create payment";/,
      "compact shortens the label instead of hiding it",
    );
    assert.match(payOutstandingSrc, /act\.setAttribute\("aria-label",/, "always announced");
  });

  it("no rule hides the action's spans wholesale — that would take the icon with it", () => {
    // uiIconHtml wraps its svg in a <span class="ui-ico">, so `.group-action span { display:
    // none }` hides the glyph as well and leaves an empty pill. The label carries its own class
    // precisely so it can be targeted alone.
    assert.doesNotMatch(
      css,
      /\.group-action\s+span\s*\{[^}]*display:\s*none/,
      "target .action-label, not every span inside the button",
    );
    assert.match(payOutstandingSrc, /<span class="action-label">/);
  });

  it("a one-line node forbids wrapping, so \"one line\" is enforced and not merely hoped for", () => {
    // Flex will shrink a row below its content width and break the date into "2026-07-" / "27",
    // which reads as a mangled two-line node. With nowrap the pressure becomes clipping, which
    // the measurements can actually see.
    assert.match(
      css,
      /\.group-node\.compact, \.group-node\.compact \* \{ white-space: nowrap; \}/,
      "the compact node must not be allowed to wrap",
    );
  });

  it("a suggested payment is identified by its own id, never by its date", () => {
    // payOn is not unique: the bank calendar pulls a Saturday and a Sunday due date onto the same
    // Friday, so one vendor can have several proposals on one date. Using the date as the identity
    // lit every proposal sharing it (5zorro 2026-09-08).
    assert.doesNotMatch(
      payOutstandingSrc,
      /dataset\.agg\s*=\s*group\.payOn/,
      "the group node's data-agg must come from groupIdOf, not payOn",
    );
    assert.match(payOutstandingSrc, /function groupIdOf\(/);
    assert.match(payOutstandingSrc, /aggId:\s*groupIdOf\(/);
  });
});
