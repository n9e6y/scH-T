import { BottomNav } from "@/components/chrome";
import { EmptyState } from "@/components/empty-state";

export default function InquiriesPage() {
  return (
    <div className="flex h-dvh flex-col">
      <EmptyState title="هنوز از فروشگاهی نپرسیدی"
        body="وقتی قیمت یا موجودی رو از فروشنده بپرسی، جوابش اینجا با ساعت دقیق میاد."
        action={{ label: "یه کالا پیدا کن", href: "/" }} />
      <BottomNav />
    </div>
  );
}
