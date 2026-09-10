import { useState } from "react";
import { Icon } from "./Icons.jsx";
import { Alert } from "./ui.jsx";

const plans = [
  { name: "Starter", description: "For new creators", monthly: 29, yearly: 24, accounts: "5 connected social accounts", features: ["Multiple accounts per platform", "Unlimited posts", "Schedule posts", "AI agent access", "Carousel posts", "Human support"] },
  { name: "Creator", description: "For growing creators", monthly: 39, yearly: 33, accounts: "15 connected social accounts", popular: true, features: ["Everything in Starter", "Bulk video scheduling", "Content studio access", "Analytics", "Human support"] },
  { name: "Growth", description: "For growing teams and agencies", monthly: 59, yearly: 49, accounts: "50 connected social accounts", features: ["Everything in Creator", "Viral growth reports", "Priority human support", "Invite team members"] },
  { name: "Pro", description: "For scaling brands", monthly: 99, yearly: 83, accounts: "Unlimited connected accounts", best: true, features: ["Everything in Growth", "Advanced API access", "Priority processing", "Viral growth consulting"] },
];

export default function Billing({ localPreview }) {
  const [yearly, setYearly] = useState(false), [notice, setNotice] = useState("");
  return <>
    <div className="bridge-intro-row"><p>Compare plans and choose the account capacity and support that fit your publishing workflow.</p></div>
    <Alert message={notice} success/>
    <div className="bridge-billing-cycle" role="group" aria-label="Billing frequency"><button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button><button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>2 months free</span></button></div>
    <div className="bridge-plan-grid">{plans.map((plan, index) => <article className={`bridge-panel bridge-plan-card ${index === 0 ? "current" : ""}`} key={plan.name}>{index === 0 && <span className="bridge-current-plan">Current plan</span>}<div className="bridge-plan-heading"><h2>{plan.name}</h2>{plan.popular && <span>Most popular</span>}{plan.best && <span>Best value</span>}</div><p>{plan.description}</p><div className="bridge-plan-price"><strong>${yearly ? plan.yearly : plan.monthly}</strong><span>/month</span></div>{yearly && <small>Billed yearly</small>}<ul><li className="strong"><Icon name="check" size={17}/>{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><Icon name="check" size={17}/>{feature}</li>)}</ul><button className={`bridge-button ${index === 0 ? "secondary" : ""}`} disabled={index === 0 || localPreview} onClick={() => setNotice(`Checkout for the ${plan.name} plan is ready to connect to your billing provider.`)}>{index === 0 ? "Current plan" : `Choose ${plan.name}`} {index !== 0 && <Icon name="arrow" size={16}/>}</button></article>)}</div>
    <p className="bridge-billing-footnote"><Icon name="check" size={15}/> All paid plans include a 7-day money-back guarantee.</p>
  </>;
}
