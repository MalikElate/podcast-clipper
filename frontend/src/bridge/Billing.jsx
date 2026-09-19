import { useEffect, useState } from "react";
import { Icon } from "./Icons.jsx";
import { Alert } from "./ui.jsx";
import { api } from "./BridgeApi.js";
import { PLANS } from "../pricing.js";
import { SUBSCRIPTION_STATUSES, checkoutNotice, billingWarning } from "./billingState.js";

export default function Billing({ localPreview }) {
  const [returnParams] = useState(() => new URLSearchParams(window.location.search));
  const [yearly, setYearly] = useState(true);
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(returnParams.get("checkout") === "success" ? "Checking your subscription with Stripe…" : "");
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer, attempts = 0;
    setChecking(true); setError("");
    async function load() {
      try {
        const sessionId = returnParams.get("session_id");
        if (sessionId && returnParams.get("checkout") === "success") {
          const result = await api.confirmCheckout(sessionId, controller.signal);
          if (controller.signal.aborted) return;
          setBilling(result.billing);
          const confirmation = checkoutNotice(result);
          setNotice(confirmation.message);
          if (confirmation.pending && ++attempts < 8) { timer = setTimeout(load, 1500); return; }
        } else {
          const result = await api.getBilling(controller.signal, returnParams.has("portal_return") || returnParams.get("checkout") === "success" || refreshCount > 0);
          if (controller.signal.aborted) return;
          setBilling(result);
          if (returnParams.get("checkout") === "success") setNotice(["active", "trialing"].includes(result.status) ? "Your subscription is active." : "Your payment hasn’t been confirmed yet. Refresh billing in a moment.");
          else if (returnParams.has("portal_return")) setNotice("Your billing details are up to date.");
        }
        setChecking(false);
      } catch (loadError) {
        if (!controller.signal.aborted) { setNotice(""); setError(loadError.message); setChecking(false); }
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [returnParams, refreshCount]);

  const active = SUBSCRIPTION_STATUSES.has(billing?.status);

  async function goToBilling(planId) {
    setError(""); setNotice(""); setBusy(planId);
    try {
      const { url } = active ? await api.createBillingPortal() : await api.createCheckout(planId, yearly ? "yearly" : "monthly");
      window.location.assign(url);
    } catch (actionError) {
      if (actionError.code === "subscription_exists") { await manageBilling(); return; }
      setError(actionError.message); setBusy("");
    }
  }

  async function manageBilling() {
    setError(""); setBusy("portal");
    try { const { url } = await api.createBillingPortal(); window.location.assign(url); }
    catch (actionError) { setError(actionError.message); setBusy(""); }
  }

  return <>
    <div className="bridge-intro-row"><p>Compare plans and choose the account capacity and support that fit your publishing workflow.</p>{billing?.canManage && <button className="bridge-button secondary" disabled={Boolean(busy)} onClick={manageBilling}>{busy === "portal" ? "Opening…" : "Manage billing"}</button>}</div>
    <Alert message={error}/><Alert message={notice} success/>
    <Alert message={billingWarning(billing?.status)}/>
    <button className="bridge-button secondary" disabled={checking || Boolean(busy)} onClick={() => setRefreshCount(count => count + 1)}>{checking ? "Checking billing…" : "Refresh billing"}</button>
    {billing && !billing.configured && !localPreview && <Alert message="Checkout is temporarily unavailable. Please try again later or contact hello@findmeadow.com."/>}
    {active && <div className="bridge-panel bridge-billing-summary"><div><span>Current plan</span><strong>{PLANS.find(plan => plan.id === billing.planId)?.name || "Paid plan"}</strong></div><div><span>Status</span><strong>{billing.status.replaceAll("_", " ")}</strong></div><div><span>Billing</span><strong>{billing.cycle || "—"}</strong></div>{billing.currentPeriodEnd && <div><span>{billing.cancelAtPeriodEnd ? "Ends" : "Renews"}</span><strong>{new Date(billing.currentPeriodEnd).toLocaleDateString()}</strong></div>}</div>}
    <div className="bridge-billing-cycle" role="group" aria-label="Billing frequency"><button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button><button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button></div>
    <div className="bridge-plan-grid">{PLANS.map(plan => <article className={`bridge-panel bridge-plan-card ${billing?.planId === plan.id && active ? "current" : ""}`} key={plan.name}>{billing?.planId === plan.id && active && <span className="bridge-current-plan">Current plan</span>}<div className="bridge-plan-heading"><h2>{plan.name}</h2>{plan.popular && <span>Most popular</span>}{plan.best && <span>Best value</span>}</div><p>{plan.description}</p><div className="bridge-plan-price"><strong>${yearly ? plan.yearly : plan.monthly}</strong><span>/month</span></div><small>{yearly ? `Billed $${plan.yearly * 12} yearly` : "Billed monthly"}</small><ul><li className="strong"><Icon name="check" size={17}/>{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><Icon name="check" size={17}/>{feature}</li>)}</ul><button className={`bridge-button ${billing?.planId === plan.id && active ? "secondary" : ""}`} disabled={localPreview || Boolean(busy) || checking || !billing || (!active && !billing.configured)} onClick={() => goToBilling(plan.id)}>{busy === plan.id ? "Opening…" : active ? billing?.planId === plan.id ? "Manage current plan" : `Switch to ${plan.name}` : `Choose ${plan.name}`} {busy !== plan.id && <Icon name="arrow" size={16}/>}</button></article>)}</div>
    <p className="bridge-billing-footnote"><Icon name="check" size={15}/> Secure subscription checkout and billing management are provided by Stripe.</p>
  </>;
}
