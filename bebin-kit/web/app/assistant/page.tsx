import { BottomNav } from "@/components/chrome";
import { EmptyState } from "@/components/empty-state";

export default function AssistantPage() {
  return (
    <div className="flex h-dvh flex-col">
      <EmptyState pose="searching" title="دستیار هنوز آماده نیست"
        body="دستیار گفت‌وگومحور در مرحله‌ی بعد اضافه می‌شه. فعلاً از جست‌وجو و دسته‌ها استفاده کن."
        action={{ label: "برگرد به خانه", href: "/" }} />
      <BottomNav />
    </div>
  );
}
