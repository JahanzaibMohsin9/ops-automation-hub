import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,_#f5efe3_0%,_#e3dfd4_48%,_#d4e0da_100%)] px-6 py-12">
      <SignIn
        appearance={{
          elements: {
            card: "rounded-[1.75rem] shadow-[0_24px_60px_rgba(48,38,18,0.12)]",
          },
        }}
        forceRedirectUrl="/dashboard"
      />
    </main>
  );
}
