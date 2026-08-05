"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Generic status dropdown reused for store status, game availability, and
// product availability — each caller supplies its own value/label set so
// there's one implementation of "a status picker that shows a pending
// state while saving" instead of three near-identical ones.
export function StatusSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as T)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
