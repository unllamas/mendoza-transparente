import type { ComponentType, ReactNode } from "react";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** Block of a page with its title. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title-3-semibold tracking-tight text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Header of the topic pages: icon and topic name above the title, then a short plain-language intro and, below
 * it, the page's action (the share button).
 * Pages with breadcrumbs leave out `icon` and `topic`: the last breadcrumb carries them, so there is one line above the title.
 */
export function PageHeader({
  icon: Icon,
  topic,
  title,
  action,
  children,
}: {
  icon?: IconComponent;
  topic?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {Icon && topic && (
        <span className="flex items-center gap-2 text-body-regular text-text-secondary">
          <Icon className="size-4 text-foreground-icon-secondary" aria-hidden />
          {topic}
        </span>
      )}
      <h1 className="text-display-4-semibold tracking-tight text-balance text-text-primary sm:text-display-3-semibold">{title}</h1>
      <p className="text-headline-regular text-text-secondary text-pretty">{children}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
