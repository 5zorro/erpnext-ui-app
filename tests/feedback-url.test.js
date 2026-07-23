import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FEEDBACK_FORM_URL,
  resolveFeedbackFormUrl,
  buildFeedbackUrl,
  isPlaceholderFeedbackUrl,
} from "../src/feedback-url.js";

describe("resolveFeedbackFormUrl", () => {
  it("defaults to placeholder Google Form", () => {
    assert.equal(resolveFeedbackFormUrl({}), DEFAULT_FEEDBACK_FORM_URL);
    assert.equal(isPlaceholderFeedbackUrl(DEFAULT_FEEDBACK_FORM_URL), true);
  });

  it("uses FEEDBACK_FORM_URL env", () => {
    assert.equal(
      resolveFeedbackFormUrl({ FEEDBACK_FORM_URL: "https://docs.google.com/forms/d/e/REAL/viewform" }),
      "https://docs.google.com/forms/d/e/REAL/viewform",
    );
  });
});

describe("buildFeedbackUrl", () => {
  it("adds version and host class without secrets", () => {
    const url = buildFeedbackUrl("https://docs.google.com/forms/d/e/x/viewform?sid=evil", {
      version: "0.2.0-alpha.1",
      hostClass: "lan",
    });
    const u = new URL(url);
    assert.equal(u.searchParams.get("sid"), null);
    assert.equal(u.searchParams.get("entry.version"), "0.2.0-alpha.1");
    assert.equal(u.searchParams.get("entry.host"), "lan");
  });

  it("rejects non-http(s)", () => {
    assert.throws(() => buildFeedbackUrl("javascript:alert(1)"), TypeError);
  });
});
