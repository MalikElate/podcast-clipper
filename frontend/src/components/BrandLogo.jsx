export const MEADOW_LOGO_URL = "/meadow-logo.svg";

export default function BrandLogo({ className = "" }) {
  return (
    <span className={`brand ${className}`.trim()}>
      <img className="brand-logo-image" src={MEADOW_LOGO_URL} alt="" width="32" height="32" />
      <span className="brand-name">meadow<span className="brand-accent">.</span></span>
    </span>
  );
}
