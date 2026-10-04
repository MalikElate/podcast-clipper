import BrandLogo from "./BrandLogo.jsx";
import { FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { GENERAL_PAGES } from "../marketing/generalPages.js";
import { appHref, marketingHref, marketingPath, siteSurface } from "../siteUrls.js";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);
const FEATURED_PLATFORM_IDS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "x"];
const FEATURED_PLATFORMS = FEATURED_PLATFORM_IDS.map((id) => PLATFORMS.find((platform) => platform.id === id)).filter(Boolean);
const COMMUNITY_LINKS = [
  { label: "X", icon: FaXTwitter, color: "#111111" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/findmeadow/", icon: FaLinkedin, color: "#0a66c2" },
  { label: "Instagram", href: "https://www.instagram.com/findmeadow", icon: FaInstagram, color: "#e4405f" },
  { label: "YouTube", icon: FaYoutube, color: "#ff0000" },
];

// Marketing pages are not served on the app host, so link there absolutely.
const href = (path) => siteSurface() === "app" ? marketingHref(path) : marketingPath(path);

function FooterGroup({ title, children }) {
  return <div className="footer-link-group"><h2>{title}</h2><div>{children}</div></div>;
}

function MobileFooterGroup({ title, children }) {
  return <details className="footer-mobile-group"><summary>{title}<span aria-hidden="true" /></summary><div>{children}</div></details>;
}

function ProductLinks({ onGetStarted }) {
  return <>
    {GENERAL_PAGES.map((page) => <a href={href(page.path)} key={page.path}>{page.footerLabel}</a>)}
    <a href={href("/tiktok-roast")}>Free TikTok roast</a>
    <a href={href("/free-tools/")}>Free social media tools</a>
    <a href={href("/free-tools/media-size-guide/")}>Media-size guides</a>
    <a href={href("/pricing")}>Pricing</a>
    {onGetStarted ? <button onClick={onGetStarted}>Create your first post</button> : <a href={appHref("/dashboard")}>Create your first post</a>}
  </>;
}

function ToolLinks() {
  return <>
    {FEATURED_PLATFORMS.map((platform) => <a href={href(`/${platform.slug}`)} key={platform.id}>{platform.name} Scheduler</a>)}
    {PLATFORM_USE_CASES.filter(platform => platform.chatOnly).map(platform => <a href={href(`/${platform.slug}`)} key={platform.id}>{platform.name} Chat Scheduler</a>)}
    <a href={href("/social-media-scheduler")}>All-platform Scheduler</a>
  </>;
}

function HelpLinks() {
  return <>
    <a href={href("/#faq")}>Frequently asked questions</a>
    <a href={href("/developers")}>API and MCP server</a>
    <a href={href("/contact")}>Contact support</a>
    <a href={href("/privacy")}>Privacy policy</a>
    <a href={href("/terms")}>Terms of service</a>
  </>;
}

function CommunityLinks() {
  return COMMUNITY_LINKS.map(({ label, href, icon: Logo, color }) => {
    const content = <><Logo className="footer-community-icon" style={{ color }} aria-hidden="true" focusable="false" /><span>{label}</span></>;
    return href
      ? <a className="footer-community-link" href={href} key={label} target="_blank" rel="noopener noreferrer">{content}</a>
      : <span className="footer-community-link" key={label}>{content}</span>;
  });
}

/** The one footer shared by every public page. */
export default function SiteFooter({ onGetStarted }) {
  return (
    <footer className="landing-footer site-footer">
      <div className="site-footer-inner">
        <h2 className="sr-only">Footer links</h2>

        <div className="footer-brand-row">
          <a className="footer-legal-brand" href={href("/")} aria-label="Meadow home"><BrandLogo /></a>
        </div>

        <nav className="footer-columns" aria-label="Footer links">
          <FooterGroup title="Products"><ProductLinks onGetStarted={onGetStarted} /></FooterGroup>
          <FooterGroup title="Free tools"><ToolLinks /></FooterGroup>
          <FooterGroup title="About"><HelpLinks /></FooterGroup>
          <FooterGroup title="Community"><CommunityLinks /></FooterGroup>
        </nav>

        <nav className="footer-mobile-columns" aria-label="Footer links">
          <MobileFooterGroup title="Products"><ProductLinks onGetStarted={onGetStarted} /></MobileFooterGroup>
          <MobileFooterGroup title="Free tools"><ToolLinks /></MobileFooterGroup>
          <MobileFooterGroup title="About"><HelpLinks /></MobileFooterGroup>
          <MobileFooterGroup title="Community"><CommunityLinks /></MobileFooterGroup>
        </nav>

        <div className="footer-meta-row">
          <span className="footer-copyright">© {new Date().getFullYear()} Meadow</span>
        </div>
      </div>
    </footer>
  );
}
