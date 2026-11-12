/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { PLATFORM_ID } from "./platform.js";

// Browser branding is applied *after* normal MosaicSync localization. This keeps
// one complete 34-language catalog shared by Firefox and Chrome while ensuring
// browser-specific copy never bypasses the translation layer.
const SPECIAL_RULES = Object.freeze({
  uk: [
    [/Синхронізаці([яюї]) облікового запису Firefox/g, "Chrome Sync"],
    [/Mozilla/g, "Google"], [/Firefox/g, "Chrome"]
  ],
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

// Product-specific Chrome wording, keyed rather than added to global regex rules.
// This presentation adapter never changes Sync/Recovery protocol decisions.
const CHROME_COPY_OVERRIDES = Object.freeze({
  en: {
    syncPendingAccountWait: "Waiting for your Google Account to deliver the MosaicSync layout. This can take a few minutes; your shortcuts will appear automatically when it arrives.",
    chooseFirefoxAccount: "To synchronize between Chrome computers, sign in to Chrome with the same Google Account on each one. You can also use MosaicSync fully on just this computer."
  },
  bg: {
    syncTurnedOffDevice: "Chrome Sync е изключен на това устройство.",
    syncRemainsEnabled: "Chrome Sync остава включен."
  },
  el: {
    syncTurnedOffDevice: "Το Chrome Sync απενεργοποιήθηκε σε αυτή τη συσκευή.",
    syncRemainsEnabled: "Το Chrome Sync παραμένει ενεργό."
  },
  lt: {
    syncTurnedOffDevice: "Chrome Sync išjungtas šiame įrenginyje.",
    syncRemainsEnabled: "Chrome Sync lieka įjungtas."
  },
  lv: {
    syncTurnedOffDevice: "Chrome Sync šajā ierīcē izslēgts.",
    syncRemainsEnabled: "Chrome Sync paliek iespējots."
  },
  ro: {
    syncTurnedOffDevice: "Chrome Sync este oprit pe acest dispozitiv.",
    syncRemainsEnabled: "Chrome Sync rămâne activ."
  },
  hr: {
    syncTurnedOffDevice: "Chrome Sync isključen je na ovom uređaju.",
    syncRemainsEnabled: "Chrome Sync ostaje uključen."
  },
  sk: {
    syncTurnedOffDevice: "Chrome Sync je na tomto zariadení vypnutý.",
    syncRemainsEnabled: "Chrome Sync zostáva zapnutý."
  },
  sl: {
    syncTurnedOffDevice: "Chrome Sync je izklopljen v tej napravi.",
    syncRemainsEnabled: "Chrome Sync ostaja omogočen."
  },
  uk: {
    syncTurnedOffDevice: "Chrome Sync вимкнено на цьому пристрої.",
    syncRemainsEnabled: "Chrome Sync залишається ввімкненим."
  }
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
  const specific = CHROME_COPY_OVERRIDES[locale]?.[key];
  if (specific) return specific;
  const rules = SPECIAL_RULES[locale] || DEFAULT_RULES;
  for (const [pattern, replacement] of rules) text = text.replace(pattern, replacement);
  // Safety net for languages whose grammar does not inflect browser names.
  text = text.replace(/Mozilla/g, "Google").replace(/Firefox/g, "Chrome").replace(/Firefok\w*/g, "Chrome");
  // The only browser name in this status refers to the account provider;
  // Chrome profiles synchronize using a Google Account, not a "Chrome account".
  if (key === "syncPendingAccountWait") {
    text = text.replaceAll("Chrome", "Google");
    if (locale === "ca") text = text.replaceAll("del Google", "de Google");
  }
  // Chrome Sync is the browser feature; "Google Sync" is not a product name.
  // Restrict the correction to this presentation key, without changing account copy.
  if (key === "syncServerlessCompact") text = text.replaceAll("Google Sync", "Chrome Sync");
  if (key === "chooseFirefoxAccount" && locale === "de") {
    text = text.replace("Chrome-Konto", "Google-Konto");
  }
  if (locale === "ko") {
    // Chrome is pronounced 크롬 (consonant-final), unlike Firefox (vowel-final).
    for (const [before, after] of [
      ["Chrome가", "Chrome이"], ["Chrome는", "Chrome은"],
      ["Chrome를", "Chrome을"], ["Chrome와", "Chrome과"],
      ["Chrome로", "Chrome으로"]
    ]) text = text.replaceAll(before, after);
  }
  if (locale === "bg") text = text.replaceAll("във Chrome", "в Chrome");
  return text;
}
