import { STRINGS, type StringKey } from "../../game/i18n";
import { useGame } from "../../game/store";

export function useT(): (key: StringKey) => string {
  const lang = useGame((s) => s.settings.lang);
  return (key) => STRINGS[lang][key];
}
