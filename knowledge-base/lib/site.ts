const configuredBasePath = process.env.NEXT_PUBLIC_KB_BASE_PATH?.trim() || "";

export const BASE_PATH = configuredBasePath === "/"
  ? ""
  : configuredBasePath.replace(/\/+$/, "");

export const SITE_URL = (
  process.env.NEXT_PUBLIC_KB_SITE_URL ||
  "https://karpit0499.github.io/klar/kb"
).replace(/\/+$/, "");

export function withBasePath(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || !BASE_PATH) {
    return pathname;
  }
  if (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname;
  }
  return `${BASE_PATH}${pathname}`;
}

export function absoluteSiteUrl(pathname = "/"): string {
  const normalized = pathname === "/"
    ? ""
    : `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  return `${SITE_URL}${normalized}`;
}

export function prefixRootRelativeHtml(html: string): string {
  return html.replace(
    /\b(href|src)="(\/(?!\/)[^"]*)"/g,
    (_match, attribute: string, pathname: string) =>
      `${attribute}="${withBasePath(pathname)}"`,
  );
}

export const SOCIAL_IMAGE = absoluteSiteUrl("/og.png");
