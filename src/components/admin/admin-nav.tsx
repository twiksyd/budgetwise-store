import Link from "next/link";
import {
  Activity,
  LayoutGrid,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  Wallet,
  Wrench,
} from "lucide-react";

const LINKS = [
  { href: "/admin/orders", label: "Order Chats", icon: MessageSquare },
  { href: "/admin/history", label: "Historical Review", icon: null },
  { href: "/admin/quick-replies", label: "Quick Replies", icon: MessagesSquare },
  { href: "/admin/payment-settings", label: "Payment Settings", icon: Wallet },
  { href: "/admin/store-operations", label: "Operations", icon: null },
  { href: "/admin/product-assets", label: "Product Assets", icon: null },
  { href: "/admin/catalog-layout", label: "Catalog Layout", icon: LayoutGrid },
  { href: "/admin/roblox-sync", label: "Roblox Sync", icon: RefreshCw },
  { href: "/admin/catalog-health", label: "Catalog Health", icon: Activity },
  { href: "/admin/artwork-recovery", label: "Artwork Recovery", icon: Wrench },
] as const;

export function AdminNav() {
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 text-sm">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="hover:bg-muted inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5"
        >
          {Icon && <Icon className="size-3.5" />}
          {label}
        </Link>
      ))}
    </nav>
  );
}
