import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onActionClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
  onActionClick?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
      <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
        <Icon className="text-primary size-6" />
      </div>
      <p className="font-heading mt-4 text-base font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        {description}
      </p>
      {action && (
        <Button asChild size="sm" className="mt-5" onClick={onActionClick}>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
