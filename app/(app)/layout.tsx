import ThemeSwitcher from "@/components/ThemeSwitcher";
import Sidebar from "@/components/Sidebar";
import { auth, signOut } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr]" data-theme="dark">
      <Sidebar />
      <main className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">VNAI</div>
          <div className="flex items-center gap-3 text-sm">
            <ThemeSwitcher />
            {session?.user ? (
              <form action={async () => { "use server"; await signOut(); }}>
                <button className="text-cyan-300">Đăng xuất</button>
              </form>
            ) : null}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
