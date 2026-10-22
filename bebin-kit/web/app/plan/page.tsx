import { BottomNav } from "@/components/chrome";
import { EmptyState } from "@/components/empty-state";

export default function PlanPage() {
  return (
    <div className="flex h-dvh flex-col">
      <EmptyState title="برنامه‌ات خالیه"
        body="فروشگاه‌ها رو از فهرست فروشنده‌ها به برنامه اضافه کن تا مسیر و ساعت رسیدن رو برات بچینم."
        action={{ label: "یه کالا پیدا کن", href: "/" }} />
      <BottomNav />
    </div>
  );
}
