import assert from "node:assert/strict";
import test from "node:test";
import { hasPostContent } from "../src/bridge/postContent.js";

test("a post needs text, a title, or media before it can be saved", () => {
  assert.equal(hasPostContent(), false);
  assert.equal(hasPostContent({ caption: " \n\t", title: "  ", mediaIds: [] }), false);
  assert.equal(hasPostContent({ caption: "A caption", title: "", mediaIds: [] }), true);
  assert.equal(hasPostContent({ caption: "", title: "A title", mediaIds: [] }), true);
  assert.equal(hasPostContent({ caption: "", title: "", mediaIds: ["media-1"] }), true);
  assert.equal(hasPostContent({ caption: "", title: "", mediaIds: [], overrides: { one: { caption: "Custom text" } } }), true);
  assert.equal(hasPostContent({ caption: "", title: "", mediaIds: [], overrides: { one: { title: "Custom title" } } }), true);
});
