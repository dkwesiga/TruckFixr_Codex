const COMPANY_NAME_KEY = "truckfixr:company-name";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadCompanyName() {
  if (!canUseStorage()) return "";
  return window.localStorage.getItem(COMPANY_NAME_KEY)?.trim() ?? "";
}

export function saveCompanyName(value?: string | null) {
  if (!canUseStorage()) return;
  const next = value?.trim() ?? "";
  if (!next) {
    window.localStorage.removeItem(COMPANY_NAME_KEY);
    return;
  }
  window.localStorage.setItem(COMPANY_NAME_KEY, next);
}
