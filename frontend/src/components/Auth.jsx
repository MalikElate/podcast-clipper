import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SignIn, SignUp } from "@clerk/react";
import {
  buildSignupConsentMetadata,
  isSignupAction,
  setSignupActionsConsentState,
} from "../signupConsent.js";

function SignupAuth({ redirectUrl }) {
  const authRootRef = useRef(null);
  const privacyCheckboxRef = useRef(null);
  const [consentHost, setConsentHost] = useState(null);
  const [privacyAcceptedAt, setPrivacyAcceptedAt] = useState(null);
  const [marketingChoice, setMarketingChoice] = useState({ optedIn: false, updatedAt: null });
  const privacyAccepted = Boolean(privacyAcceptedAt);
  const consentMetadata = buildSignupConsentMetadata({
    privacyAcceptedAt,
    marketingOptIn: marketingChoice.optedIn,
    marketingUpdatedAt: marketingChoice.updatedAt,
  });

  // Clerk owns the card markup, so mount the preferences into its form after it renders.
  useEffect(() => {
    const authRoot = authRootRef.current;
    if (!authRoot) return undefined;

    let activeHost = null;

    const mountConsentControls = () => {
      const form = authRoot.querySelector(".cl-form");
      if (!form) return;

      const existingHost = activeHost?.parentElement === form
        ? activeHost
        : Array.from(form.children)
          .find((child) => child.classList.contains("signup-consent-inline-host"));
      const host = existingHost || document.createElement("div");
      host.className = "signup-consent-inline-host";

      const primaryAction = form.querySelector(".cl-formButtonPrimary");
      let actionContainer = primaryAction;
      while (actionContainer?.parentElement && actionContainer.parentElement !== form) {
        actionContainer = actionContainer.parentElement;
      }

      if (!existingHost) {
        form.insertBefore(host, actionContainer?.parentElement === form ? actionContainer : null);
      } else if (actionContainer?.parentElement === form && host.nextElementSibling !== actionContainer) {
        form.insertBefore(host, actionContainer);
      }
      activeHost = host;
      setConsentHost(host);
    };

    const observer = new MutationObserver(mountConsentControls);
    observer.observe(authRoot, { childList: true, subtree: true });
    mountConsentControls();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const authRoot = authRootRef.current;
    if (!authRoot) return undefined;

    const syncSignupActions = () => setSignupActionsConsentState(authRoot, privacyAccepted);
    const observer = new MutationObserver(syncSignupActions);
    observer.observe(authRoot, { childList: true, subtree: true });
    syncSignupActions();

    return () => {
      observer.disconnect();
      setSignupActionsConsentState(authRoot, true);
    };
  }, [privacyAccepted]);

  const blockSignupWithoutConsent = (event) => {
    if (privacyAccepted || (event.type !== "submit" && !isSignupAction(event.target))) return;

    event.preventDefault();
    event.stopPropagation();
    privacyCheckboxRef.current?.focus();
  };

  return (
    <div
      ref={authRootRef}
      className="signup-auth"
      onClickCapture={blockSignupWithoutConsent}
      onSubmitCapture={blockSignupWithoutConsent}
    >
      <div className="signup-auth-form">
        <SignUp forceRedirectUrl={redirectUrl} unsafeMetadata={consentMetadata} />
      </div>

      {consentHost && createPortal(
        <fieldset className="signup-consent-inline">
          <legend className="sr-only">Privacy and email preferences</legend>

          <label className="signup-consent-option" htmlFor="signup-privacy-consent">
            <input
              ref={privacyCheckboxRef}
              id="signup-privacy-consent"
              type="checkbox"
              checked={privacyAccepted}
              required
              onChange={(event) => setPrivacyAcceptedAt(event.target.checked ? new Date().toISOString() : null)}
            />
            <span>
              I agree to Meadow's <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
              <small>Required to create an account.</small>
            </span>
          </label>

          <label className="signup-consent-option" htmlFor="signup-marketing-consent">
            <input
              id="signup-marketing-consent"
              type="checkbox"
              checked={marketingChoice.optedIn}
              onChange={(event) => setMarketingChoice({
                optedIn: event.target.checked,
                updatedAt: new Date().toISOString(),
              })}
            />
            <span>
              I want to receive marketing and promotional emails from Meadow.
              <small>Optional. You can unsubscribe at any time.</small>
            </span>
          </label>

          {!privacyAccepted && (
            <p id="signup-consent-prompt" className="signup-consent-prompt" role="status">
              Accept the Privacy Policy to continue.
            </p>
          )}
        </fieldset>,
        consentHost,
      )}
    </div>
  );
}

// Keep authentication owned by Clerk so its native sign-in and sign-up flow,
// including headings, provider buttons, and recovery screens, remains intact.
export default function Auth({ redirectUrl = "/dashboard", mode = "sign-in" }) {
  return mode === "sign-up"
    ? <SignupAuth redirectUrl={redirectUrl} />
    : <SignIn forceRedirectUrl={redirectUrl} />;
}
