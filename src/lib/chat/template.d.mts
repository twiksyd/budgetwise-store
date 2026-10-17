export type TemplateVariable = "customer_name" | "order_number" | "roblox_username" | "total";
export const TEMPLATE_VARIABLES: readonly TemplateVariable[];
export function renderTemplate(
  body: unknown,
  values: Partial<Record<TemplateVariable, string | number | null>>,
): string;
