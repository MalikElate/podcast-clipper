import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { Alert } from "./ui.jsx";
import { api } from "./BridgeApi.js";
import { PLANS } from "../pricing.js";

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

export default function Billing({ localPreview }) {
  const initialCheckout = new URLSearchParams(window.location.search).get("checkout");
  const [yearly, setYearly] = useState(true);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(initialCheckout === "success" ? "Payment received. Your subscription is being activated." : "");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api.getBilling(controller.signal).then(setBilling).catch(loadError => { if (loadError.name !== "AbortError") setError(loadError.message); });
    return () => controller.abort();
  }, []);

  const active = ACTIVE_STATUSES.has(billing?.status);

  async function goToBilling(planId) {
    setError(""); setNotice(""); setBusy(planId);
    try {
      const { url } = active ? await api.createBillingPortal() : await api.createCheckout(planId, yearly ? "yearly" : "monthly");
      window.location.assign(url);
    } catch (actionError) { setError(actionError.message); setBusy(""); }
  }

  async function manageBilling() {
    setError(""); setBusy("portal");
    try { const { url } = await api.createBillingPortal(); window.location.assign(url); }
    catch (actionError) { setError(actionError.message); setBusy(""); }
  }

  return <>
    <div className="bridge-intro-row"><p>Compare plans and choose the account capacity and support that fit your publishing workflow.</p>{billing?.canManage && <button className="bridge-button secondary" disabled={Boolean(busy)} onClick={manageBilling}>{busy === "portal" ? "Opening…" : "Manage billing"}</button>}</div>
    <Alert message={error}/><Alert message={notice} success/>
    {billing && !billing.configured && !localPreview && <Alert message="Stripe is not configured on this server yet. Add the Stripe keys and Price IDs to enable checkout."/>}
    {active && <div className="bridge-panel bridge-billing-summary"><div><span>Current plan</span><strong>{PLANS.find(plan => plan.id === billing.planId)?.name || "Paid plan"}</strong></div><div><span>Status</span><strong>{billing.status.replaceAll("_", " ")}</strong></div><div><span>Billing</span><strong>{billing.cycle || "—"}</strong></div>{billing.currentPeriodEnd && <div><span>{billing.cancelAtPeriodEnd ? "Ends" : "Renews"}</span><strong>{new Date(billing.currentPeriodEnd).toLocaleDateString()}</strong></div>}</div>}
    <div className="bridge-billing-cycle" role="group" aria-label="Billing frequency"><button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button><button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button></div>
    <div className="bridge-plan-grid">{PLANS.map(plan => <article className={`bridge-panel bridge-plan-card ${billing?.planId === plan.id && active ? "current" : ""}`} key={plan.name}>{billing?.planId === plan.id && active && <span className="bridge-current-plan">Current plan</span>}<div className="bridge-plan-heading"><h2>{plan.name}</h2>{plan.popular && <span>Most popular</span>}{plan.best && <span>Best value</span>}</div><p>{plan.description}</p><div className="bridge-plan-price"><strong>${yearly ? plan.yearly : plan.monthly}</strong><span>/month</span></div><small>{yearly ? `Billed $${plan.yearly * 12} yearly` : "Billed monthly"}</small><ul><li className="strong"><Icon name="check" size={17}/>{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><Icon name="check" size={17}/>{feature}</li>)}</ul><button className={`bridge-button ${billing?.planId === plan.id && active ? "secondary" : ""}`} disabled={localPreview || Boolean(busy) || (billing && !billing.configured)} onClick={() => goToBilling(plan.id)}>{busy === plan.id ? "Opening…" : active ? billing?.planId === plan.id ? "Manage current plan" : `Switch to ${plan.name}` : `Choose ${plan.name}`} {busy !== plan.id && <Icon name="arrow" size={16}/>}</button></article>)}</div>
    <p className="bridge-billing-footnote"><Icon name="check" size={15}/> Secure subscription checkout and billing management are provided by Stripe.</p>
  </>;
}
