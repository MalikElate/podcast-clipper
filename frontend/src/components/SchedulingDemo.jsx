import DemoVideo from "./DemoVideo.jsx";

export default function SchedulingDemo() {
  return (
    <DemoVideo
      asset="/marketing/meadow-crosspost-demo-v1"
      label="Meadow cross-platform posting walkthrough"
      name="cross-posting demo"
      fallback="Post once to every connected platform with Meadow."
      descriptionId="scheduling-demo-description"
      description="A silent Meadow walkthrough writes one launch post, clicks Post everywhere, and shows it published to Instagram, TikTok, LinkedIn, YouTube, Facebook, and X at once. The interface shown uses illustrative sample content."
    />
  );
}
