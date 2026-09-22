import { useState } from "react";
import { PLANS, planBillingNote, planHref } from "../pricing.js";

const SECTIONS = [
  {
    title: "Publishing",
    rows: [
      { label: "Connected social accounts", hint: "The total number of social accounts connected to a Meadow workspace.", values: ["5", "10", "25", "Unlimited"] },
      { label: "Schedule posts", values: [true, true, true, true] },
      { label: "Unlimited posts", values: [false, true, true, true] },
      { label: "Multiple accounts per platform", values: [false, true, true, true] },
      { label: "Carousel posts", values: [false, true, true, true] },
      { label: "Bulk video scheduling", values: [false, false, true, true] },
    ],
  },
  {
    title: "Content and insights",
    rows: [
      { label: "Content Studio", values: [false, false, true, true] },
      { label: "Analytics", values: [false, false, true, true] },
      { label: "Viral growth reports", hint: "Deeper reports that identify patterns and opportunities across published content.", values: [false, false, false, true] },
      { label: "Viral growth consulting", values: [false, false, false, true] },
    ],
  },
  {
    title: "Automation and access",
    rows: [
      { label: "AI agent access", hint: "Prepare structured work through a supported agent connected to Meadow.", values: [true, true, true, true] },
      { label: "Advanced API access", hint: "Build custom applications and higher-volume automated publishing workflows.", values: [false, false, false, true] },
      { label: "Priority processing", hint: "Pro work is placed ahead of standard jobs when the publishing queue is busy.", values: [false, false, false, true] },
    ],
  },
  {
    title: "Team and support",
    rows: [
      { label: "Invite team members", values: [false, false, false, true] },
      { label: "Human support", values: [false, true, true, "Priority"] },
    ],
  },
];

function ArrowIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ComparisonValue({ value }) {
  if (value === true) return <span className="comparison-check" aria-label="Included"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="m4 9.2 3.2 3.2L14 5.7" /></svg></span>;
  if (value === false) return <span className="comparison-empty" aria-label="Not included">—</span>;
  return <strong className="comparison-text-value">{value}</strong>;
}

function PlanAction({ plan, yearly, onChoosePlan, busyPlan }) {
  const cycle = yearly ? "yearly" : "monthly";
  const loading = busyPlan === plan.id;
  if (plan.id !== "free" && onChoosePlan) {
    return <button type="button" disabled={Boolean(busyPlan)} onClick={() => onChoosePlan(plan.id, cycle)}>{loading ? "Opening checkout…" : `Choose ${plan.name}`} {!loading && <ArrowIcon />}</button>;
  }
  return <a href={planHref(plan, cycle)}>{plan.id === "free" ? "Try for free" : `Choose ${plan.name}`} <ArrowIcon /></a>;
}

function PlanSummary({ plan, yearly, onChoosePlan, busyPlan, compact = false }) {
  const price = yearly ? plan.yearly : plan.monthly;
  return (
    <div className={`comparison-plan-summary ${plan.popular ? "is-featured" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="comparison-plan-name"><strong>{plan.name}</strong>{plan.popular && <span>Popular</span>}</div>
      <div className="comparison-plan-price"><strong>${price}</strong><span>/month</span></div>
      <small>{planBillingNote(plan, yearly)}</small>
      <PlanAction plan={plan} yearly={yearly} onChoosePlan={onChoosePlan} busyPlan={busyPlan} />
    </div>
  );
}

export default function PricingComparison({ yearly, onYearlyChange, onChoosePlan, busyPlan = "" }) {
  const [mobilePlan, setMobilePlan] = useState("creator");
  const activeIndex = Math.max(0, PLANS.findIndex(plan => plan.id === mobilePlan));
  const activePlan = PLANS[activeIndex];

  return (
    <section className="pricing-comparison" aria-labelledby="pricing-comparison-title">
      <div className="pricing-comparison-heading">
        <h2 id="pricing-comparison-title">Compare Meadow plans</h2>
        <p>See the limits and capabilities included at every level.</p>
        <div className="pricing-cycle comparison-cycle" role="group" aria-label="Comparison billing frequency">
          <button className={!yearly ? "active" : ""} onClick={() => onYearlyChange(false)}>Monthly</button>
          <button className={yearly ? "active" : ""} onClick={() => onYearlyChange(true)}>Yearly <span>Save up to 17%</span></button>
        </div>
      </div>

      <div className="pricing-comparison-desktop">
        <div className="pricing-comparison-table" role="table" aria-label="Meadow plan feature comparison">
          <div className="pricing-comparison-row comparison-header-row" role="row">
            <div className="comparison-feature-header" role="columnheader">Features</div>
            {PLANS.map(plan => <div role="columnheader" key={plan.id}><PlanSummary plan={plan} yearly={yearly} onChoosePlan={onChoosePlan} busyPlan={busyPlan} /></div>)}
          </div>
          {SECTIONS.map(section => (
            <div className="pricing-comparison-group" role="rowgroup" key={section.title}>
              <div className="pricing-comparison-section-title">{section.title}</div>
              {section.rows.map(row => (
                <div className="pricing-comparison-row" role="row" key={row.label}>
                  <div className="comparison-feature-label" role="rowheader">{row.label}{row.hint && <span tabIndex="0" title={row.hint} aria-label={`${row.label}: ${row.hint}`}>?</span>}</div>
                  {row.values.map((value, index) => <div className={PLANS[index].popular ? "is-featured" : ""} role="cell" key={PLANS[index].id}><ComparisonValue value={value} /></div>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="pricing-comparison-mobile">
        <div className="comparison-mobile-tabs" role="tablist" aria-label="Choose a plan to compare">
          {PLANS.map(plan => <button type="button" role="tab" aria-selected={plan.id === mobilePlan} className={plan.id === mobilePlan ? "active" : ""} onClick={() => setMobilePlan(plan.id)} key={plan.id}>{plan.name}</button>)}
        </div>
        <div className="comparison-mobile-panel" role="tabpanel">
          <PlanSummary plan={activePlan} yearly={yearly} onChoosePlan={onChoosePlan} busyPlan={busyPlan} compact />
          {SECTIONS.map(section => <div className="comparison-mobile-group" key={section.title}><h3>{section.title}</h3>{section.rows.map(row => <div key={row.label}><span>{row.label}</span><ComparisonValue value={row.values[activeIndex]} /></div>)}</div>)}
        </div>
      </div>
    </section>
  );
}
