import test from "node:test";
import assert from "node:assert/strict";
import { homepageSchema, softwareApplicationSchema } from "../src/siteSchema.js";
import { CONTACT_EMAIL, CONTACT_PHONE } from "../src/siteContact.js";

const graph = homepageSchema()["@graph"];
const byType = type => graph.find(node => node["@type"] === type);

test("the homepage describes the organization, the site and the product", () => {
  assert.deepEqual(graph.map(node => node["@type"]), ["Organization", "WebSite", "SoftwareApplication"]);
  assert.equal(homepageSchema()["@context"], "https://schema.org");
});

test("the organization gives the same contact details the site publishes", () => {
  const organization = byType("Organization");
  assert.equal(organization.email, CONTACT_EMAIL);
  assert.equal(organization.telephone, CONTACT_PHONE);
  assert.match(organization.url, /^https:\/\/findmeadow\.com\//);
});

test("the site and product point back at one organization record", () => {
  const id = byType("Organization")["@id"];
  assert.equal(byType("WebSite").publisher["@id"], id);
  assert.equal(byType("SoftwareApplication").publisher["@id"], id);
});

test("static schema does not claim one regional price for every visitor", () => {
  assert.equal(softwareApplicationSchema.offers, undefined);
  assert.ok(!JSON.stringify(softwareApplicationSchema).includes("USD"));
});

// Structured data is a claim made to search engines, and an unearned claim is
// the kind that gets a site penalised rather than promoted.
test("nothing is claimed that the site cannot show", () => {
  const serialized = JSON.stringify(homepageSchema());
  for (const invented of ["aggregateRating", "ratingValue", "reviewCount", "review", "Review", "userInteractionCount", "testimonial", "award"]) {
    assert.ok(!serialized.includes(invented), `Structured data must not claim ${invented}`);
  }
});
