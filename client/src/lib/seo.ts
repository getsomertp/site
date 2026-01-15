import { useEffect } from "react";

type SeoOptions = {
  title: string;
  description?: string;
  /** Path portion, e.g. "/giveaways". Defaults to current location pathname + search. */
  path?: string;
  /** Absolute or root-relative image URL. Defaults to /opengraph.jpg. */
  image?: string;
};

function upsertMeta(selector: string, attrs: Record<string, string>, content: string) {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useSeo(opts: SeoOptions) {
  useEffect(() => {
    const title = opts.title ? `${opts.title} • GETSOME` : "GETSOME";
    const description =
      opts.description ||
      "Giveaways, partner leaderboards, and stream games — connect with Discord and join the community.";
    const image = opts.image || "/opengraph.jpg";
    const path = opts.path ?? `${window.location.pathname}${window.location.search}`;
    const origin = window.location.origin;
    const url = `${origin}${path}`;

    document.title = title;
    upsertMeta('meta[name="description"]', { name: "description" }, description);

    upsertMeta('meta[property="og:title"]', { property: "og:title" }, title);
    upsertMeta('meta[property="og:description"]', { property: "og:description" }, description);
    upsertMeta('meta[property="og:type"]', { property: "og:type" }, "website");
    upsertMeta('meta[property="og:url"]', { property: "og:url" }, url);
    upsertMeta('meta[property="og:image"]', { property: "og:image" }, image);
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name" }, "GETSOME");

    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card" }, "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, title);
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description" }, description);
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image" }, image);

    upsertLink("canonical", url);
  }, [opts.title, opts.description, opts.path, opts.image]);
}
