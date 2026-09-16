/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { PLATFORM_ID } from "./platform.js";

// Browser branding is applied *after* normal MosaicSync localization. This keeps
// one complete 33-language catalog shared by Firefox and Chrome while ensuring
// browser-specific copy never bypasses the translation layer.
const SPECIAL_RULES = Object.freeze({
  en: [
    [/Firefox Account Sync/g, "Chrome Sync"],
    [/Mozilla account/g, "Google account"], [/Mozilla's/g, "Google's"], [/Mozilla/g, "Google"],
    [/Firefox's/g, "Chrome's"], [/Firefox/g, "Chrome"]
  ],
  de: [
    [/Firefox-Konto-Synchronisierung/g, "Chrome Sync"],
    [/Mozilla-Konto/g, "Google-Konto"], [/Mozillas/g, "Googles"], [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
  nl: [
    [/Firefox-account(?:synchronisatie)?/gi, match => /synchronisatie/i.test(match) ? "Chrome Sync" : "Google-account"],
    [/Mozilla-account/g, "Google-account"], [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
  da: [
    [/Firefox-kontosynkronisering/g, "Chrome Sync"], [/Mozilla-konto/g, "Google-konto"],
    [/Mozillas/g, "Googles"], [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
  nb: [
    [/Firefox-kontosynkronisering/g, "Chrome Sync"], [/Mozilla-kontoen/g, "Google-kontoen"],
    [/Mozillas/g, "Googles"], [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
  sv: [
    [/Firefox-kontosynkronisering/g, "Chrome Sync"], [/Mozilla-konto/g, "Google-konto"],
    [/Mozillas/g, "Googles"], [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
  fi: [
    [/Firefox-tilin synkronointi/g, "Chrome Sync"],
    [/Mozilla-tililläsi/g, "Google-tililläsi"], [/Mozilla-tilisi/g, "Google-tilisi"], [/Mozillan/g, "Googlen"], [/Mozilla/g, "Google"],
    [/Firefox-kirjanmerkkisi/g, "Chrome-kirjanmerkkisi"], [/Firefox-kirjanmerkkejäsi/g, "Chrome-kirjanmerkkejäsi"],
    [/Firefox-kirjanmerkkien/g, "Chrome-kirjanmerkkien"], [/Firefox-pikakuvakkeiden/g, "Chrome-pikakuvakkeiden"],
    [/Firefox-pikakuvakkeita/g, "Chrome-pikakuvakkeita"], [/Firefox-pikakuvaketta/g, "Chrome-pikakuvaketta"],
    [/Firefox-pikakuvakkeet/g, "Chrome-pikakuvakkeet"], [/Firefox-aloitussivusi/g, "Chrome-aloitussivusi"],
    [/Firefox-tietokoneillesi/g, "Chrome-tietokoneillesi"], [/Firefox-tietokoneiden/g, "Chrome-tietokoneiden"],
    [/Firefox-ehdotukset/g, "Chrome-ehdotukset"], [/Firefoxin/g, "Chromen"], [/Firefoxiin/g, "Chromeen"],
    [/Firefoxissa/g, "Chromessa"], [/Firefoxista/g, "Chromesta"], [/Firefoxia/g, "Chromea"],
    [/Firefoxien/g, "Chrome-selainten"], [/Firefox/g, "Chrome"]
  ],
  pl: [
    [/Synchronizacja konta Firefox/g, "Chrome Sync"], [/konta Mozilla/g, "konta Google"], [/Mozilla/g, "Google"],
    [/Firefoksa/g, "Chrome"], [/Firefoksem/g, "Chrome"], [/Firefoksie/g, "Chrome"], [/Firefoxie/g, "Chrome"],
    [/Firefoxami/g, "przeglądarkami Chrome"], [/Firefox/g, "Chrome"]
  ],
  cs: [
    [/Synchronizace účtu Firefox/g, "Chrome Sync"], [/účtu Mozilla/g, "účtu Google"], [/Mozilla/g, "Google"],
    [/Firefoxu/g, "Chromu"], [/Firefoxem/g, "Chromem"], [/Firefoxy/g, "prohlížeči Chrome"], [/Firefox/g, "Chrome"]
  ],
  eu: [
    [/Firefox kontuaren sinkronizazioa/g, "Chrome Sync"], [/Mozilla kontu/g, "Google kontu"], [/Mozillaren/g, "Google-ren"], [/Mozilla/g, "Google"],
    [/Firefoxeko/g, "Chrome-ko"], [/Firefoxekin/g, "Chrome-rekin"], [/Firefoxek/g, "Chrome-k"], [/Firefoxen/g, "Chrome-ren"], [/Firefox/g, "Chrome"]
  ],
  hr: [
    [/Sinkronizacija Firefox računa/g, "Chrome Sync"], [/Mozillinu/g, "Googleovu"], [/Mozillin/g, "Googleov"], [/Mozilla/g, "Google"],
    [/Firefoxovu/g, "Chromeovu"], [/Firefoxom/g, "Chromeom"], [/Firefoxa/g, "Chromea"], [/Firefoxu/g, "Chromeu"], [/Firefox/g, "Chrome"]
  ],
  et: [
    [/Firefoxi konto Sync/g, "Chrome Sync"], [/Mozilla/g, "Google"],
    [/Firefoxide/g, "Chrome'ide"], [/Firefoxist/g, "Chrome'ist"], [/Firefoxis/g, "Chrome'is"], [/Firefoxi/g, "Chrome'i"], [/Firefox/g, "Chrome"]
  ],
  hu: [
    [/Firefox-fiók Sync/g, "Chrome Sync"], [/Mozilla-fiókon/g, "Google-fiókon"], [/Mozilla/g, "Google"],
    [/Firefox-kezdőlapja/g, "Chrome-kezdőlapja"], [/Firefox-könyvjelzők/g, "Chrome-könyvjelzők"], [/Firefox-parancsikonok/g, "Chrome-parancsikonok"], [/Firefox-parancsikon/g, "Chrome-parancsikon"],
    [/Firefox-javaslatok/g, "Chrome-javaslatok"], [/Firefox-engedély/g, "Chrome-engedély"], [/Firefox-fiók/g, "Chrome-fiók"],
    [/Firefoxról/g, "Chrome-ról"], [/Firefoxnál/g, "Chrome-nál"], [/Firefoxon/g, "Chrome-on"], [/Firefoxot/g, "Chrome-ot"], [/Firefoxba/g, "Chrome-ba"], [/Firefoxra/g, "Chrome-ra"],
    [/Firefoxok/g, "Chrome böngészők"], [/Firefox/g, "Chrome"]
  ],
  sk: [
    [/Synchronizácia účtu Firefox/g, "Chrome Sync"], [/Mozilly/g, "Googlu"], [/Mozilla/g, "Google"],
    [/Firefoxmi/g, "prehliadačmi Chrome"], [/Firefoxom/g, "Chromom"], [/Firefoxu/g, "Chromu"], [/Firefoxe/g, "Chrome"], [/Firefox/g, "Chrome"]
  ],
  sl: [
    [/Sinhronizacija računa Firefox/g, "Chrome Sync"], [/Mozillino/g, "Googlovo"], [/Mozillin/g, "Googlov"], [/Mozilla/g, "Google"],
    [/Firefoxovo/g, "Chromovo"], [/Firefoxom/g, "Chromom"], [/Firefoxa/g, "Chroma"], [/Firefoxu/g, "Chromu"], [/Firefoxi/g, "brskalniki Chrome"], [/Firefox/g, "Chrome"]
  ]
});

const DEFAULT_RULES = Object.freeze([
  [/Firefox Account Sync/g, "Chrome Sync"],
  [/Mozilla/g, "Google"],
  [/Firefox/g, "Chrome"]
]);

export function platformizeUiText(value, locale = "en", key = "") {
  let text = String(value ?? "");
  if (PLATFORM_ID !== "chrome" || !text) return text;
  // Chrome Sync is a product name, so keep this primary label consistent in
  // every locale while surrounding explanatory prose stays fully localized.
  if (key === "firefoxSync") return "Chrome Sync";
  const rules = SPECIAL_RULES[locale] || DEFAULT_RULES;
  for (const [pattern, replacement] of rules) text = text.replace(pattern, replacement);
  // Safety net for languages whose grammar does not inflect browser names.
  text = text.replace(/Mozilla/g, "Google").replace(/Firefox/g, "Chrome").replace(/Firefok\w*/g, "Chrome");
  return text;
}
