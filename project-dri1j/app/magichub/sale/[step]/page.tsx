import MagicHubClient from "@/components/magichub/MagicHubClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ step: string }>;
  searchParams: Promise<{ quote?: string }>;
};

export default async function MagicHubSaleWorkflowPage({ params, searchParams }: PageProps) {
  const { step } = await params;
  const q = await searchParams;
  const n = Math.min(8, Math.max(1, parseInt(step, 10) || 1));
  return <MagicHubClient view="saleWorkflow" saleStep={n} resumeQuoteId={q.quote ?? null} />;
}
