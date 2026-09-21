import { Icon } from "./Icons.jsx";

export default function ClippingStudioComingSoon() {
  return <section className="bridge-panel bridge-coming-soon">
    <div className="bridge-coming-soon-visual" aria-hidden="true">
      <span className="bridge-coming-soon-ring ring-one"/>
      <span className="bridge-coming-soon-ring ring-two"/>
      <span className="bridge-coming-soon-icon"><Icon name="clips" size={38}/></span>
    </div>
    <h2>Clipping studio</h2>
    <p>Clipping tools are not available in this workspace.</p>
  </section>;
}
