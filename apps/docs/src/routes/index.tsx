import { Landing } from "@/components/landing";
import { baseOptions } from "@/lib/layout.shared";
import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <Landing />
    </HomeLayout>
  );
}
