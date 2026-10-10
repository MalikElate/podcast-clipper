import "./pageSkeleton.css";

export default function PageSkeleton({ label }) {
  return <div className="bridge-page-skeleton" role="status">
    <span className="bridge-visually-hidden">{label}…</span>
    <div className="bridge-skeleton-list" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <div className="bridge-skeleton-row" key={index}>
        <span className="bridge-skeleton-block bridge-skeleton-image"/>
        <div className="bridge-skeleton-copy">
          <span className="bridge-skeleton-block bridge-skeleton-line wide"/>
          <span className="bridge-skeleton-block bridge-skeleton-line"/>
          <span className="bridge-skeleton-block bridge-skeleton-line"/>
          <span className="bridge-skeleton-block bridge-skeleton-line short"/>
        </div>
      </div>)}
    </div>
  </div>;
}
