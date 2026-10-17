import { cx } from "@mt/ui/lib/cx";
import { RiCheckLine, RiLinkM } from "@remixicon/react";
import { type ComponentType, type MouseEvent, type ReactNode, useState } from "react";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/**
 * Block of a page with its title. The title links to the block itself (`#id`) and copies that link, so anyone can
 * share a section ("Coparticipación" of San Rafael) instead of the whole page. `id` is a short, stable word in
 * Spanish (`leyes`, `personal`): it is part of shared URLs, so it never carries a year or a name that changes.
 */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4">
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** Title of a `Section`: a link to `#id` with its icon always visible; tapping it also copies the full URL. */
export function SectionTitle({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: MouseEvent<HTMLAnchorElement>) => {
    // The anchor still does the native part (scroll and #id in the address bar); the copy is a bonus when allowed.
    const url = `${location.origin}${location.pathname}${location.search}#${id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
    if (e.currentTarget.hash === location.hash) e.currentTarget.scrollIntoView();
  };
  const Icon = copied ? RiCheckLine : RiLinkM;
  return (
    <h2 className={cx("text-title-3-semibold tracking-tight text-text-primary", className)}>
      <a
        href={`#${id}`}
        onClick={copy}
        data-track="share.section.copy"
        data-track-section={id}
        className="group -my-1.5 inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-md py-1.5 text-pretty outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2"
      >
        <span>{children}</span>
        <Icon
          className="size-4 shrink-0 text-foreground-icon-tertiary transition-colors duration-150 group-hover:text-text-link group-active:text-text-link"
          aria-hidden
        />
        <span className="sr-only" aria-live="polite">
          {copied ? "Link a esta sección copiado" : ""}
        </span>
      </a>
    </h2>
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
