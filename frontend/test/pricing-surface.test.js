import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const surface = appSource.slice(appSource.indexOf("function PricingSurface("), appSource.indexOf("function AppSurface("));
const { code } = await transformWithOxc(surface, "pricing-surface.jsx", { jsx: { runtime: "classic" } });

function renderPricingSurface({ signedIn, marketing = false, showAuth = false } = {}) {
  const calls = [];
  const history = [];
  let stateIndex = 0;
  const quote = { countryCode: "CM", currency: "XAF", plans: { starter: { monthlyMinor: 5000, yearlyMinor: 50000 } } };
  const context = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    URLSearchParams,
    window: { location: { search: "?checkout=starter&cycle=monthly" }, history: { replaceState: (...args) => history.push(args[2]) } },
    useAuth: () => ({ user: signedIn ? { id: "user" } : null, loading: false }),
    usePricingQuote: () => ({ quote, status: "ready", retry: () => calls.push("retry") }),
    useState: value => [++stateIndex === 1 && showAuth ? true : value, () => {}],
    useEffect: callback => callback(),
    PLANS: [{ id: "starter", name: "Starter" }],
    localPreview: false,
    api: { createCheckout: () => calls.push("checkout") },
    appHref: path => `https://app.findmeadow.com${path}`,
    Pricing: "Pricing", Auth: "Auth", DomainRedirect: "DomainRedirect", OpeningMeadow: "OpeningMeadow",
  };
  const tree = runInNewContext(`${code}\nPricingSurface({ marketing: ${marketing} });`, context);
  return { tree, calls, history };
}

function find(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  return node.props?.children?.map(child => find(child, type)).find(Boolean) || null;
}

test("cross-domain plan selection shows the newly quoted app price before checkout", () => {
  const marketing = renderPricingSurface({ marketing: true, signedIn: true });
  assert.equal(marketing.tree.type, "DomainRedirect");
  assert.equal(marketing.tree.props.href, "https://app.findmeadow.com/pricing?checkout=starter&cycle=monthly");

  const app = renderPricingSurface({ signedIn: true });
  const pricing = find(app.tree, "Pricing");
  assert.ok(pricing);
  assert.equal(pricing.props.initialYearly, false);
  assert.match(pricing.props.checkoutPrompt, /Review the prices for your location/);
  assert.equal(pricing.props.pricingQuoteState.quote.currency, "XAF");
  assert.deepEqual(app.calls, [], "Arriving with a plan query must never start Stripe automatically");
});

test("a signed-out arrival reviews its app quote before sign-in or checkout", async () => {
  const app = renderPricingSurface({ signedIn: false });
  const pricing = find(app.tree, "Pricing");
  assert.ok(pricing);
  assert.equal(find(app.tree, "Auth"), null);
  await pricing.props.onChoosePlan("starter", "monthly");
  assert.deepEqual(app.history, ["/pricing?checkout=starter&cycle=monthly"]);
  assert.deepEqual(app.calls, []);

  const signIn = renderPricingSurface({ signedIn: false, showAuth: true });
  assert.equal(find(signIn.tree, "Auth").props.redirectUrl, "/pricing?checkout=starter&cycle=monthly");
  assert.deepEqual(signIn.calls, []);
});
