import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "Sign in · clicked" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one.",
  not_member: "That email isn't a member of this organization. Ask an admin to invite you.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const auth = await getMe();
  if ("me" in auth) redirect("/dashboard");
  const { error } = await searchParams;
  const key = typeof error === "string" ? error : auth.error === "not_member" ? "not_member" : "";
  return (
    <main className={styles.wrap}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          {BRAND[0]}
        </span>
        <span className={styles.wordmark}>{BRAND}</span>
      </div>
      <section className={`post ${styles.card}`} aria-labelledby="login-heading">
        <h1 id="login-heading" className={styles.h1}>
          Sign in
        </h1>
        <p className={styles.sub}>We&apos;ll email you a magic link. No password needed.</p>
        {ERRORS[key] && (
          <p className={styles.error} role="alert">
            {ERRORS[key]}
          </p>
        )}
        <LoginForm />
      </section>
    </main>
  );
}
