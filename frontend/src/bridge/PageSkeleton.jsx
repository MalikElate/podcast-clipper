import { PLATFORM_ORDER, sortPlatforms } from "./platforms.js";
import "./analytics.css";
import "./pageSkeleton.css";

function Block({ className = "", style }) {
  return <span className={`bridge-skeleton-block ${className}`} style={style}/>;
}

function AccountsSkeleton({ catalog }) {
  const platforms = catalog ? sortPlatforms(catalog) : PLATFORM_ORDER.map(id => ({ id }));
  return <>
    <div className="bridge-intro-row">
      <p className="bridge-skeleton-intro"><Block className="bridge-skeleton-line"/><Block className="bridge-skeleton-line"/><Block className="bridge-skeleton-line short bridge-skeleton-intro-mobile"/></p>
      <Block className="bridge-skeleton-connected"/>
    </div>
    <div className="bridge-connections-board">
      {platforms.map(platform => <section className="bridge-connection-column" key={platform.id} style={{ "--platform-color": "var(--b-line)" }}>
        <header className="bridge-connection-column-header">
          <span className="bridge-social-icon"><Block className="bridge-skeleton-platform-icon"/></span>
          <div><h2><Block className="bridge-skeleton-platform-name"/></h2><span><Block className="bridge-skeleton-account-type"/></span></div>
          <strong className="bridge-skeleton-block"/>
        </header>
        <div className="bridge-connection-column-body">
          <div className="bridge-connection-empty">
            <Block className="bridge-skeleton-avatar"/>
            <div className="bridge-skeleton-account-copy"><Block className="bridge-skeleton-line"/><Block className="bridge-skeleton-line short"/></div>
          </div>
        </div>
        <div className="bridge-connection-column-footer">
          <div className="bridge-format-list">{(platform.formats || ["image", "video"]).map(format => <span className="bridge-skeleton-block bridge-skeleton-text" key={format}>{format}</span>)}</div>
          <span className="bridge-button secondary"><Block className="bridge-skeleton-connect"/></span>
        </div>
      </section>)}
    </div>
  </>;
}

function AnalyticsSkeleton({ accounts }) {
  const platformCount = accounts ? new Set(accounts.map(account => account.platform)).size : 3;
  return <div className="bridge-analytics-dashboard">
    <div className="bridge-analytics-tabs"><span><Block className="bridge-skeleton-tab"/></span><span><Block className="bridge-skeleton-tab short"/></span></div>
    <div className="bridge-analytics-toolbar">
      <div className="bridge-analytics-platform-filter">{Array.from({ length: platformCount + 1 }, (_, index) => <span key={index}><Block className="bridge-skeleton-filter" style={{ width: index ? 78 : 28 }}/></span>)}</div>
      <Block className="bridge-skeleton-period"/>
      <div className="bridge-analytics-sync"><small><Block className="bridge-skeleton-sync-time"/></small><Block className="bridge-skeleton-sync"/></div>
    </div>
    <p className="bridge-analytics-period-caption"><Block className="bridge-skeleton-caption"/></p>
    <div className="bridge-analytics-summary">
      {Array.from({ length: 5 }, (_, index) => <article className="bridge-analytics-stat" key={index}>
        <div><span><Block className="bridge-skeleton-stat-label"/></span><small><Block className="bridge-skeleton-stat-change"/></small></div>
        <strong><Block className="bridge-skeleton-stat-value"/></strong>
      </article>)}
    </div>
    <section className="bridge-panel bridge-analytics-platforms">
      <h2><Block className="bridge-skeleton-section-title"/></h2>
      {Array.from({ length: platformCount }, (_, index) => <div className="bridge-analytics-platform-row" key={index}>
        <span className="bridge-skeleton-platform-label"><Block className="bridge-skeleton-small-icon"/><Block className="bridge-skeleton-filter"/></span>
        <div className="bridge-analytics-bar"><Block className="bridge-skeleton-bar"/></div>
        <strong><Block className="bridge-skeleton-platform-value"/></strong>
        <small><Block className="bridge-skeleton-platform-share"/></small>
        <small className="bridge-analytics-post-count"><Block className="bridge-skeleton-platform-value"/></small>
      </div>)}
      {!platformCount && <p className="bridge-small"><Block className="bridge-skeleton-caption"/></p>}
    </section>
    <section className="bridge-panel bridge-analytics-publication">
      <div className="bridge-analytics-chart-heading">
        <div><h2><Block className="bridge-skeleton-section-title"/></h2><p><Block className="bridge-skeleton-chart-description"/></p></div>
        <div className="bridge-analytics-chart-switches">{[3, 2].map(count => <div className="bridge-analytics-toggle" key={count}>{Array.from({ length: count }, (_, index) => <span key={index}><Block className="bridge-skeleton-toggle"/></span>)}</div>)}</div>
      </div>
      <div className="bridge-publish-chart">
        <div className="bridge-publish-chart-scroll"><svg viewBox="0 0 1000 310">
          <rect className="bridge-skeleton-block" x="52" y="18" width="934" height="248" rx="4"/>
          {[0, 1, 2, 3, 4].map(index => <rect className="bridge-skeleton-block" key={index} x="6" y={20 + index * 60} width="30" height="8" rx="2"/>)}
          {[0, 1, 2, 3, 4, 5].map(index => <rect className="bridge-skeleton-block" key={index} x={52 + index * 172} y="285" width="52" height="8" rx="2"/>)}
        </svg></div>
        <p className="bridge-publish-chart-note"><Block className="bridge-skeleton-chart-description"/></p>
      </div>
    </section>
    <p className="bridge-analytics-definition"><Block className="bridge-skeleton-line"/></p>
  </div>;
}

export default function PageSkeleton({ page, label, catalog, accounts }) {
  return <div className={`bridge-page-skeleton bridge-page-skeleton-${page}`} role="status">
    <span className="bridge-visually-hidden">{label}…</span>
    <div aria-hidden="true">
      {page === "accounts" ? <AccountsSkeleton catalog={catalog}/> : <AnalyticsSkeleton accounts={accounts}/>}
    </div>
  </div>;
}
