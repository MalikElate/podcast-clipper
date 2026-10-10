// Keep Clerk's controls and authentication handlers; only arrange its entry form.
export const SIGNUP_APPEARANCE = {
  options: { socialButtonsPlacement: "bottom", socialButtonsVariant: "blockButton" },
  elements: {
    socialButtons: { display: "flex", flexDirection: "column" },
    socialButtonsBlockButton__facebook: { order: -1 },
  },
};

export function syncSignupLayout(root, mode = "sign-up") {
  const signingIn = mode === "sign-in";
  const emailRow = root.querySelector(signingIn ? ".cl-formFieldRow__identifier" : ".cl-formFieldRow__emailAddress");
  const passwordRow = root.querySelector(".cl-formFieldRow__password");
  const email = emailRow?.querySelector(signingIn ? 'input[name="identifier"]' : 'input[name="emailAddress"]');
  const form = email?.closest(".cl-form");
  const isEntry = Boolean(form && (signingIn || (passwordRow && emailRow.parentElement === passwordRow.parentElement)));
  root.dataset.signupEntry = String(isEntry);
  root.dataset.emailEntered = String(Boolean(email?.value.trim()));
  if (!isEntry) return;

  emailRow.parentElement.classList.add("signup-entry-fields");
  let action = form.querySelector(".cl-formButtonPrimary");
  while (action?.parentElement && action.parentElement !== form) action = action.parentElement;
  if (action?.parentElement === form) action.classList.add("signup-entry-action");
}

export function syncSigninLayout(root) {
  syncSignupLayout(root, "sign-in");
  if (root.dataset.signupEntry !== "true") return;
  // Clerk already supports entering a password on its email step (for autofill).
  // Expose that same native input once email is entered, including to keyboards
  // and screen readers, without changing its value or authentication handlers.
  const passwordRow = root.querySelector(".cl-formFieldRow__password");
  if (!passwordRow) return;
  const entered = root.dataset.emailEntered === "true";
  const hidden = String(!entered);
  if (passwordRow.getAttribute("aria-hidden") !== hidden) passwordRow.setAttribute("aria-hidden", hidden);
  for (const control of passwordRow.querySelectorAll('input[name="password"], .cl-formFieldInputShowPasswordButton')) {
    const tabIndex = entered ? 0 : -1;
    if (control.tabIndex !== tabIndex) control.tabIndex = tabIndex;
  }
}

// Clerk's form remains a single DOM subtree. Keep Tab navigation in the same
// order as the visible controls, including in browsers without reading-flow.
export function handleSignupTab(event, root) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey
    || root.dataset.signupEntry !== "true") return;
  const selector = 'input, button, a[href], select, textarea, [tabindex]';
  const all = Array.from(root.querySelectorAll(selector)).filter(element => (
    element.tabIndex >= 0 && !element.matches(":disabled")
    && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden"
  ));
  const groups = [
    ".cl-formFieldRow__emailAddress, .cl-formFieldRow__identifier", ".cl-socialButtonsRoot",
    ".cl-formFieldRow__password", ".signup-consent-inline-host", ".signup-entry-action",
  ];
  const ordered = groups.flatMap(group => {
    const controls = all.filter(element => element.closest(group));
    return group === ".cl-socialButtonsRoot"
      ? controls.sort((a, b) => Number(b.matches(".cl-socialButtonsBlockButton__facebook")) - Number(a.matches(".cl-socialButtonsBlockButton__facebook")))
      : controls;
  });
  ordered.push(...all.filter(element => !ordered.includes(element)));
  const index = ordered.indexOf(event.target);
  if (index < 0) return;
  const next = ordered[index + (event.shiftKey ? -1 : 1)];
  if (!next) return; // Allow focus to leave the auth card normally at either end.
  event.preventDefault();
  next.focus();
}
