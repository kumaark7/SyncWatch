/** Custom header makes state-changing API requests ineligible for cross-site form submission. */
export function browserRequest(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  headers.set("X-Requested-With", "XmlHttpRequest");
  return fetch(input, { ...init, headers, credentials: "include" });
}
