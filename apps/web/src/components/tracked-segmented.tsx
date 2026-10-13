import { Segmented } from "@mt/ui/components/segmented";

import { track } from "@/analytics.ts";

/** Segmented control with analytics: each change sends `<trackId>.change` (default `segmented.change`). */
export function TrackedSegmented<T extends string>({
  trackId,
  onChange,
  ...props
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  trackId?: string;
}) {
  return (
    <Segmented
      {...props}
      onChange={(v) => {
        if (v !== props.value) track(`${trackId ?? "segmented"}.change`, { value: v, label: props.label });
        onChange(v);
      }}
    />
  );
}
