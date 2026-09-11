import { SignIn } from "@clerk/react";

// Keep authentication owned by Clerk so its native sign-in and sign-up flow,
// including headings, provider buttons, and recovery screens, remains intact.
export default function Auth({ redirectUrl = "/dashboard" }) {
  return <SignIn forceRedirectUrl={redirectUrl} />;
}
