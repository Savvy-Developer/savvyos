/**
 * The slug a CMS page is saved and looked up under: "Some_Page " -> "some-page".
 *
 * One function for the studio's save, the public page lookup and the server's
 * 404 check, so an address the site renders is never answered with a 404 just
 * because it was typed in another case or with other separators.
 */
export function websitePageSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}
