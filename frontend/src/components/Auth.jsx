import { SignIn, SignUp } from "@clerk/react";

// Keep authentication owned by Clerk so its native sign-in and sign-up flow,
// including headings, provider buttons, and recovery screens, remains intact.
export default function Auth({ redirectUrl = "/dashboard", mode = "sign-in" }) {
  return mode === "sign-up"
    ? <SignUp forceRedirectUrl={redirectUrl} />
    : <SignIn forceRedirectUrl={redirectUrl} />;
}
