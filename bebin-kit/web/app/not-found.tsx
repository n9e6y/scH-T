import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col">
      <EmptyState pose="confused" title="این صفحه پیدا نشد" body="شاید لینک قدیمی است. از خانه دوباره شروع کن." action={{ label: "برگشت به خانه", href: "/" }} />
    </div>
  );
}
