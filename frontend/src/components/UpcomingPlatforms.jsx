import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { PlatformIcon } from "../bridge/ui.jsx";

export default function UpcomingPlatforms() {
  return <div className="upcoming-platforms" aria-label="Coming soon platforms">
    <p>Twitch and Kick chat publishing — coming soon</p>
    <div>{PLATFORM_USE_CASES.filter(platform => platform.comingSoon).map(platform => (
      <a key={platform.id} href={`/${platform.slug}`} style={{ "--platform-color": platform.color }}>
        <PlatformIcon platform={platform.id} size={28}/>
        <span>{platform.name} <small>Coming soon</small></span>
      </a>
    ))}</div>
  </div>;
}
