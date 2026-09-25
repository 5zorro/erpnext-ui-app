/**
 * Reading from ERPNext for the receiving pages: where to ask, and what a failed answer means for
 * the person looking at the screen. Pure — the page does the fetching.
 *
 * The pages sit behind the receiving proxy on ERPNext's own address (plan P2), so a request is an
 * ordinary same-address request carrying the signed-in session. Nothing here holds a password or
 * a token.
 */

/** The page to sign in on, returning here afterwards. */
export function signInPath(returnTo) {
  return `/login?redirect-to=${encodeURIComponent(returnTo)}`;
}

/** Where one Purchase Order is read from. Order names contain slashes in some naming series. */
export function purchaseOrderPath(orderNumber) {
  const name = String(orderNumber ?? "").trim();
  if (!name) throw new Error("erp read: no order number");
  return `/api/resource/Purchase%20Order/${encodeURIComponent(name)}`;
}

/**
 * Turn a failed read into what the screen says. Statuses as this ERPNext version answers them
 * (checked 2026-09-24): 403 when not signed in, 404 when there is no such order.
 * Returns `{ kind, message }`; kind is "sign-in", "not-found", "not-allowed" or "error".
 */
export function readFailure(status, orderNumber) {
  if (status === 401 || status === 403) {
    return {
      kind: "sign-in",
      message: "Sign in to ERPNext first. If you are signed in, this account may not be allowed to read purchase orders.",
    };
  }
  if (status === 404) {
    return { kind: "not-found", message: `There is no purchase order called “${orderNumber}”. Check the number.` };
  }
  if (status === 417) {
    return { kind: "not-allowed", message: "ERPNext refused the request. Ask a supervisor to check this account’s permissions." };
  }
  if (status === 0) {
    return { kind: "error", message: "No answer from ERPNext. Check the network connection and try again." };
  }
  return { kind: "error", message: `ERPNext answered with an error (${status}). Try again; if it repeats, tell a supervisor.` };
}
