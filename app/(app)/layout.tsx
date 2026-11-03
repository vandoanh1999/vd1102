import ThemeSwitcher from "@/components/ThemeSwitcher";
import Sidebar from "@/components/Sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[16rem_1fr]" data-theme="dark">
      <Sidebar />
      <main className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">VNAI <span className="text-xs font-normal text-rose-300/80">AI mỏ hỗn</span></div>
          <ThemeSwitcher />
        </div>
        {children}
      </main>
    </div>
  );
}
