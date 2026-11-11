import { contact } from "@/lib/copy";
import { timeline } from "@/lib/features";
import { BOWLING_PATH, hrefFor, onNavigate } from "@/lib/router";
import { seek } from "./navTargets";

const siteLinks = [
  { label: "Research", href: "#research" },
  { label: "Projects & experience", href: "#experience" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
  { label: "Groundhog bowling", href: BOWLING_PATH },
];

const elsewhereLinks = [
  { label: "Email", href: `mailto:${contact.email}` },
  { label: "LinkedIn", href: contact.linkedinHref },
  { label: "Résumé (PDF)", href: contact.resumeHref },
];

// The four leaves, as links to their own pages. With no bar across the top of
// the site, this column is the only way to a leaf that does not involve
// scrolling to the middle of the journey and finding it on the stem.
const leafLinks = timeline.map((s) => ({
  label: `${s.detail.institution.replace("California Institute of Technology", "Caltech")}${
    s.detail.kind.endsWith("Group") ? ` — ${s.detail.kind}` : ""
  }`,
  href: hrefFor(s.id),
}));

function LinkColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <nav aria-label={title}>
      <h3 className="text-xs font-medium uppercase tracking-[0.2em] text-muted">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => {
          // Three kinds of link in these columns, and each wants something
          // different: anything leaving the site opens away from it, a
          // fragment glides down the journey, and a leaf's path is a route.
          const external = link.href.startsWith("http");
          const fragment = link.href.startsWith("#");
          const route = link.href.startsWith("/experience/") || link.href === BOWLING_PATH;
          return (
            <li key={link.label}>
              <a
                href={link.href}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                onClick={
                  fragment ? seek(link.href) : route ? onNavigate(link.href) : undefined
                }
                className="text-sm text-ink transition-colors hover:text-bloom"
              >
                {link.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The one opaque block on the page. Everything above it is glass over the
 * field; the footer is where the document finally lands on the ground.
 */
export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-line bg-void px-6 py-16 sm:px-10 md:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <span className="font-display text-2xl text-ink">
              Alexander Recce<span className="text-bloom">.</span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Physics and computer science at Caltech. Two-dimensional materials,
              the devices made out of them, and the code that measures both.
            </p>
          </div>

          <LinkColumn title="Site" links={siteLinks} />
          <LinkColumn title="Elsewhere" links={elsewhereLinks} />

          <LinkColumn title="Leaves" links={leafLinks} />
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-line pt-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Alexander Recce</p>
          <p>Pasadena, CA · New York, NY</p>
        </div>
      </div>
    </footer>
  );
}
