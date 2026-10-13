import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Block of a page with its title. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** Header of the topic pages: icon and topic name above the title, then a short plain-language intro. */
export function PageHeader({
  icon: Icon,
  topic,
  title,
  children,
}: {
  icon: LucideIcon;
  topic: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        <Icon className="size-4 text-ink-muted" aria-hidden />
        {topic}
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      <p className="text-ink-2 text-pretty">{children}</p>
    </div>
  );
}
