import { Suspense } from "react";
import { notFound } from "next/navigation";
import Dashboard from "@/app/(workspace)/dashboard/page";
import Workflows from "@/app/(workspace)/workflows/page";
import Companies from "@/app/(workspace)/companies/page";
import Leads from "@/app/(workspace)/leads/page";
import Approvals from "@/app/(workspace)/approvals/page";
import Activity from "@/app/(workspace)/activity/page";
import Settings from "@/app/(workspace)/settings/page";
import Loading from "@/app/loading";
import { WorkflowDetail } from "@/components/workflow-detail/workflow-detail";
import { DemoAutomation, DemoIntelligence, DemoIntro, DemoStrategy } from "@/components/demo/demo-overview";
import { OnboardingPanel } from "@/components/app/onboarding-panel";

export const dynamic = "force-dynamic";
export default async function DemoPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  let content: React.ReactNode;
  if (slug.length === 2 && slug[0] === "workflows") content = <WorkflowDetail id={slug[1]} />;
  else if (slug.length !== 1) notFound();
  else switch (slug[0]) {
    case "dashboard": content = <><DemoIntro /><Dashboard /></>; break;
    case "workflows": content = <Workflows />; break;
    case "companies": content = <Companies />; break;
    case "leads": content = <Leads />; break;
    case "approvals": content = <Approvals />; break;
    case "activity": content = <Activity />; break;
    case "settings": content = <Settings />; break;
    case "automation": content = <DemoAutomation />; break;
    case "intelligence": content = <DemoIntelligence />; break;
    case "icps": content = <DemoStrategy kind="icps" />; break;
    case "templates": content = <DemoStrategy kind="templates" />; break;
    case "onboarding": content = <OnboardingPanel />; break;
    default: notFound();
  }
  return <Suspense fallback={<Loading />}>{content}</Suspense>;
}
