import { SearchInput } from "@mt/ui/components/search-input";
import { useEffect } from "react";

import { track } from "../analytics.ts";

/** Search box of the long lists, with analytics: one `search.query` when the person stops typing. */
export function ListSearch({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => track("search.query", { search: label, query: q.slice(0, 80) }), 1200);
    return () => clearTimeout(t);
  }, [value, label]);
  return <SearchInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} label={label} />;
}
