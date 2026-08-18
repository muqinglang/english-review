"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearBrowserSupabaseAuthCookies, createBrowserSupabaseClient } from "@/lib/supabase/browser";

type CallbackTokens = {
  accessToken: string;
  refreshToken: string;
};

function tokensFromImplicitCallback(): CallbackTokens | null {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

function callbackError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = query.get("error_code") ?? hash.get("error_code") ?? query.get("error") ?? hash.get("error");
  const description = query.get("error_description") ?? hash.get("error_description");
  return code || description ? { code, description } : null;
}

function failureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message.toLowerCase() : "";
  if (detail.includes("otp_expired") || detail.includes("expired") || detail.includes("access_denied")) {
    return "This sign-in email has expired or was already used. Go back to the login page to resend it, then click the newest email.";
  }
  return "Sign-in verification failed for now. Go back to the login page and try again; if you're using email sign-in, click the newest email.";
}

async function saveSession(tokens: CallbackTokens) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(tokens),
  });
  if (!response.ok) throw new Error("Couldn't save the sign-in session.");
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Completing sign-in…");
  useEffect(() => {
    async function finish() {
      try {
        const redirectError = callbackError();
        if (redirectError) {
          throw new Error(redirectError.code ?? redirectError.description ?? "Invalid sign-in link.");
        }

        // Server-generated email links use an implicit callback and return the
        // tokens in the URL fragment. Handle that before creating the PKCE
        // browser client, which deliberately rejects implicit callback URLs.
        const implicitTokens = tokensFromImplicitCallback();
        if (implicitTokens) {
          await saveSession(implicitTokens);
        } else {
          // createBrowserClient initializes the PKCE callback itself. Calling
          // exchangeCodeForSession() here a second time consumes the same code
          // twice and makes otherwise valid Google logins fail.
          const { data, error } = await createBrowserSupabaseClient().auth.getSession();
          if (error || !data.session) throw error ?? new Error("No valid sign-in session was obtained.");
          await saveSession({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          });
        }

        clearBrowserSupabaseAuthCookies();
        window.history.replaceState(window.history.state, "", "/auth/callback");
        window.location.replace("/review");
      } catch (error) {
        setMessage(failureMessage(error));
      }
    }
    finish();
  }, []);
  return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f2] px-5 text-[#172223]"><section className="rounded-xl bg-white p-6 text-center shadow-lg"><p className="font-bold">{message}</p>{message !== "Completing sign-in…" && <Link href="/login" className="mt-5 inline-block rounded-lg bg-[#172223] px-4 py-2 text-sm font-bold text-white">Back to login</Link>}</section></main>;
}
