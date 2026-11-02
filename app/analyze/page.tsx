import type { Metadata } from "next";
import DemoAnalyzer from "@/components/demo-analyzer/demo-analyzer";

export const metadata: Metadata = {
  title: "Demo analysis · PaladinsCat Pro",
  robots: { index: false, follow: false },
};

export default function AnalyzePage() {
  return <DemoAnalyzer />;
}
