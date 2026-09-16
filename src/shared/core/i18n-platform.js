/* Browser-neutral UI text adapter. Chrome overrides this module at build time. */
export function platformizeUiText(value, _locale = "en", _key = "") { return String(value ?? ""); }
