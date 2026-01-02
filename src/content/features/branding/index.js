import { injectStylesheet } from "../../utils/styleLoader.js";

export function injectBrandingStyles() {
  injectStylesheet(
    "content/features/branding/branding.css",
    "instafn-branding"
  );
}
