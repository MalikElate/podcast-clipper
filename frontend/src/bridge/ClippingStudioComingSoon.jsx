import { Icon } from "./Icons.jsx";

export default function ClippingStudioComingSoon() {
  return <section className="bridge-panel bridge-coming-soon">
    <div className="bridge-coming-soon-visual" aria-hidden="true">
      <span className="bridge-coming-soon-ring ring-one"/>
      <span className="bridge-coming-soon-ring ring-two"/>
      <span className="bridge-coming-soon-icon"><Icon name="clips" size={38}/></span>
    </div>
    <span className="bridge-coming-soon-label">Coming soon</span>
    <h2>Clipping studio is on the way</h2>
    <p>We’re preparing a focused workspace for turning long videos into polished, social-ready clips.</p>
  </section>;
}
