/**
 * Start Polar checkout for a tier.
 *
 * A real form POST, not a link or a `window.location` assignment: the handler
 * creates a Polar customer and a checkout session, so as a GET it could be
 * fired by link prefetch, a link preview, or a forged cross-site `<img>` —
 * none of which carry user intent. A form submit still produces the top-level
 * navigation the hosted-checkout redirect needs, which `fetch()` would not:
 * fetch follows the 303 in the background and leaves the user on the page.
 */
export function startCheckout(tier = "pro"): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `/api/checkout?tier=${encodeURIComponent(tier)}`;
  document.body.appendChild(form);
  form.submit();
}
