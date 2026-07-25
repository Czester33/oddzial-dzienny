"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = searchParams.get("from") || "/pacjenci";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Nie udało się zalogować");
        return;
      }

      router.replace(from.startsWith("/") ? from : "/pacjenci");
      router.refresh();
    } catch {
      setError("Nie udało się połączyć z serwerem");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <h1 className="text-[20px] font-semibold text-slate-800 dark:text-slate-100">
          Oddział dzienny
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
          Wpisz hasło, aby wejść do aplikacji.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block text-[15px] font-medium text-slate-700 dark:text-slate-300">
            Hasło
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[17px] text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        {error ? (
          <p className="mt-3 text-[15px] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-5 w-full rounded-md bg-blue-600 px-3 py-2.5 text-[17px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Logowanie…" : "Wejdź"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">Ładowanie…</div>}>
      <LoginForm />
    </Suspense>
  );
}
