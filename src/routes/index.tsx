import { createFileRoute } from "@tanstack/react-router";
import { GameShell } from "@/components/hud/GameShell";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <GameShell />;
}
