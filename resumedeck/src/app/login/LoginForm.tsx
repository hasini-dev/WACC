"use client";

import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import styles from "./login.module.css";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <p className={styles.sent} role="status">
        Check <strong>{email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <label htmlFor="email">Work email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a link"}
      </button>
      {state === "error" && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
