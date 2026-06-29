import { TdDemoApp } from "@/components/td/td-demo-app";

export const metadata = {
  title: "Tournament Director — Live Demo",
  description:
    "Try the full National Baseball Ratings tournament-director portal with sample data. No login required.",
  robots: { index: false },
};

export default function TdDemoPage() {
  return <TdDemoApp />;
}
