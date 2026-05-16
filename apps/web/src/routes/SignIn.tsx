import { authClient } from '../lib/auth-client.js';

export function SignIn() {
  const signIn = (provider: 'google' | 'discord') =>
    authClient.signIn.social({ provider, callbackURL: '/' });

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-10 px-6 py-12 text-center">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">Prophecy</h1>
        <p className="max-w-md text-balance text-neutral-400">
          Sign in to play.
        </p>
      </header>

      <div className="w-full max-w-sm space-y-3">
        <button
          type="button"
          onClick={() => signIn('google')}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-medium text-neutral-100 transition hover:border-neutral-500 min-h-[44px]"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <button
          type="button"
          onClick={() => signIn('discord')}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-base font-medium text-neutral-100 transition hover:border-neutral-500 min-h-[44px]"
        >
          <DiscordIcon />
          Sign in with Discord
        </button>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true" fill="#5865F2">
      <path d="M15.246 1.18A14.857 14.857 0 0 0 11.58 0a.056.056 0 0 0-.059.028 10.348 10.348 0 0 0-.457.939 13.712 13.712 0 0 0-4.12 0A9.44 9.44 0 0 0 6.481.028.058.058 0 0 0 6.42 0a14.822 14.822 0 0 0-3.667 1.18.052.052 0 0 0-.024.021C.383 5.1-.23 8.903.072 12.656a.062.062 0 0 0 .023.042 14.935 14.935 0 0 0 4.499 2.274.059.059 0 0 0 .064-.021c.347-.474.655-.975.92-1.498a.057.057 0 0 0-.031-.08 9.831 9.831 0 0 1-1.406-.67.058.058 0 0 1-.006-.096c.095-.071.189-.145.279-.22a.056.056 0 0 1 .058-.008c2.95 1.346 6.147 1.346 9.062 0a.056.056 0 0 1 .059.007c.09.075.184.15.28.221a.058.058 0 0 1-.005.096 9.236 9.236 0 0 1-1.407.669.057.057 0 0 0-.03.08c.27.524.578 1.024.919 1.498a.058.058 0 0 0 .064.022 14.895 14.895 0 0 0 4.507-2.274.059.059 0 0 0 .023-.041c.375-4.274-.628-7.988-2.659-11.477a.047.047 0 0 0-.023-.021ZM6.012 10.378c-.888 0-1.621-.815-1.621-1.816s.718-1.816 1.621-1.816c.91 0 1.636.822 1.622 1.816 0 1.001-.719 1.816-1.622 1.816Zm5.99 0c-.888 0-1.621-.815-1.621-1.816s.718-1.816 1.621-1.816c.91 0 1.636.822 1.622 1.816 0 1.001-.712 1.816-1.622 1.816Z" />
    </svg>
  );
}
