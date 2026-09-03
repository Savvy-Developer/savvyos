import PulseMyWorkPage from "@/pages/PulseMyWorkPage";

/**
 * Legacy compatibility surface. Pulse work now lives in My EOS and always uses
 * the shared item editor, so no parallel create or edit behavior remains here.
 */
export default function PulseWorkItemsPage() {
  return <PulseMyWorkPage />;
}
