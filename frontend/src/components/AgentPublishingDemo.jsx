import DemoVideo from "./DemoVideo.jsx";
import "./agentPublishingDemo.css";

export default function AgentPublishingDemo() {
  return (
    <DemoVideo
      asset="/marketing/meadow-agent-demo-v1"
      label="Posting to every platform from an AI agent"
      name="AI agent posting demo"
      fallback="Ask your AI agent to post, and Meadow publishes to every connected platform."
      descriptionId="agent-demo-description"
      description="A silent, illustrative walkthrough: someone asks an AI agent connected to Meadow through MCP to post a launch clip to every channel. The agent creates the post in Meadow, publishes it, and Instagram, TikTok, YouTube, LinkedIn, Facebook, and X are each marked Posted. No real posts are created by this demo."
    />
  );
}
