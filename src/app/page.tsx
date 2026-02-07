import { getSessionUser } from "@/lib/auth-helpers";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";

export default async function LandingPage() {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <Navbar user={user} />
      <main className="flex-1">
        <Hero />
        <Features />
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}
