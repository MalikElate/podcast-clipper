import { useEffect, useState } from "react";
import { api } from "./BridgeApi.js";
import { Alert, Badge, Check, Field } from "./ui.jsx";
import { Icon } from "./Icons.jsx";

const money = (cents = 0, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
const date = value => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));

export default function Affiliate({ user }) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: user?.displayName || "", email: user?.email || "", code: "", acceptedTerms: false });

  useEffect(() => {
    const controller = new AbortController();
    api.affiliate(controller.signal).then(setData).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, []);

  async function enroll(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { setData(await api.enrollAffiliate(form)); setNotice("Your affiliate link is ready to share."); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(data.affiliate.referralLink);
      setNotice("Referral link copied.");
    } catch { setError("Copy failed. Select the link and copy it manually."); }
  }

  if (!data) return <div className="bridge-panel bridge-empty"><p>{error || "Loading affiliate program…"}</p></div>;
  const { affiliate, program } = data;

  if (!affiliate) return <>
    <div className="bridge-affiliate-hero bridge-panel">
      <div className="bridge-affiliate-hero-copy"><span className="bridge-affiliate-kicker">Meadow partners</span><h2>Share Meadow. Earn {program.commissionPercent}%.</h2><p>Recommend the publishing workspace to creators, brands, and agencies. You earn recurring commission when a referred customer pays for Meadow.</p></div>
      <div className="bridge-affiliate-rate"><strong>{program.commissionPercent}%</strong><span>commission</span></div>
    </div>
    <Alert message={error}/><Alert message={notice} success/>
    <div className="bridge-affiliate-join">
      <section className="bridge-panel bridge-affiliate-benefits">
        <h2>How it works</h2>
        <ol>
          <li><span>1</span><div><strong>Join instantly</strong><p>Create your personal referral link from this page.</p></div></li>
          <li><span>2</span><div><strong>Share Meadow</strong><p>Send your link to people who publish social content.</p></div></li>
          <li><span>3</span><div><strong>Earn commission</strong><p>Get {program.commissionPercent}% of attributed subscription payments.</p></div></li>
        </ol>
      </section>
      <section className="bridge-panel bridge-affiliate-form">
        <h2>Join the affiliate program</h2>
        <p>Referrals are credited for {program.attributionDays} days after a link click.</p>
        <form onSubmit={enroll}>
          <Field label="Your name"><input required maxLength="80" value={form.displayName} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} autoComplete="name"/></Field>
          <Field label="Email for affiliate updates"><input required type="email" maxLength="254" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} autoComplete="email"/></Field>
          <Field label="Custom referral code" hint="Optional · 4–32 lowercase letters, numbers, or hyphens"><input minLength="4" maxLength="32" pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?" value={form.code} onChange={event => setForm(current => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))} placeholder="your-name" autoCapitalize="none"/></Field>
          <Check checked={form.acceptedTerms} onChange={event => setForm(current => ({ ...current, acceptedTerms: event.target.checked }))}>I agree to promote Meadow honestly, avoid self-referrals, and accept that refunded or fraudulent purchases do not earn commission.</Check>
          <button className="bridge-button full" disabled={busy || !form.acceptedTerms}>{busy ? "Creating your link…" : "Join and get my link"}<Icon name="arrow" size={16}/></button>
        </form>
      </section>
    </div>
  </>;

  const stats = data.stats || {};
  return <>
    <div className="bridge-intro-row"><p>Share your personal link and track the customers and commission it generates.</p><Badge status={affiliate.status}>{affiliate.status}</Badge></div>
    <Alert message={error}/><Alert message={notice} success/>
    <section className="bridge-panel bridge-affiliate-link-card">
      <div><span className="bridge-affiliate-kicker">Your referral link</span><h2>{affiliate.displayName}</h2><p>{program.commissionPercent}% recurring commission · {program.attributionDays}-day attribution</p></div>
      <div className="bridge-affiliate-link"><input readOnly value={affiliate.referralLink} onFocus={event => event.target.select()} aria-label="Referral link"/><button className="bridge-button" onClick={copyLink}><Icon name="copy" size={16}/> Copy link</button></div>
    </section>
    <div className="bridge-affiliate-stats">
      <article className="bridge-panel"><span>Link clicks</span><strong>{stats.clicks || 0}</strong><small>Recorded visits</small></article>
      <article className="bridge-panel"><span>Referrals</span><strong>{stats.referrals || 0}</strong><small>Signed-up accounts</small></article>
      <article className="bridge-panel"><span>Customers</span><strong>{stats.customers || 0}</strong><small>Paying referrals</small></article>
      <article className="bridge-panel accent"><span>Pending commission</span><strong>{money(stats.pendingCents)}</strong><small>Awaiting approval</small></article>
    </div>
    <div className="bridge-affiliate-grid">
      <section className="bridge-panel">
        <div className="bridge-section-label"><strong>Commission activity</strong><span>{data.transactions.length} transactions</span></div>
        {data.transactions.length ? <div className="bridge-table-scroll"><table className="bridge-table bridge-affiliate-table"><thead><tr><th>Date</th><th>Event</th><th>Sale</th><th>Commission</th><th>Status</th></tr></thead><tbody>{data.transactions.map(item => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{item.type === "refund" ? "Refund" : "Payment"}</td><td>{money(item.amountCents, item.currency)}</td><td className={item.commissionCents < 0 ? "negative" : "positive"}>{money(item.commissionCents, item.currency)}</td><td><Badge status={item.status}>{item.status}</Badge></td></tr>)}</tbody></table></div> : <div className="bridge-affiliate-empty"><Icon name="affiliate" size={27}/><div><strong>No commission yet</strong><p>Payments from referred customers will appear here.</p></div></div>}
      </section>
      <aside className="bridge-panel bridge-affiliate-balance">
        <h2>Earnings</h2>
        <div><span>Pending</span><strong>{money(stats.pendingCents)}</strong></div>
        <div><span>Approved</span><strong>{money(stats.approvedCents)}</strong></div>
        <div><span>Paid</span><strong>{money(stats.paidCents)}</strong></div>
        <p>Approved commission becomes payable through the connected billing provider.</p>
      </aside>
    </div>
  </>;
}
