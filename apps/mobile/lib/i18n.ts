import * as Localization from "expo-localization";
import { I18n } from "i18n-js";

import en from "../messages/en.json";
import he from "../messages/he.json";

const i18n = new I18n({ he, en });
i18n.defaultLocale = "he";
i18n.locale = Localization.getLocales()[0]?.languageCode ?? "he";
i18n.enableFallback = true;

export default i18n;
