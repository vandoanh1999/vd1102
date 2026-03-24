"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    if (!email || !password) { setError("Vui lòng nhập email và mật khẩu"); return; }
    setLoading(true); setError("");
    try {
      if (mode === "signup") {
        const r = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!r.ok) { setError("Đăng ký thất bại, email đã tồn tại"); setLoading(false); return; }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.ok) { location.href = "/"; }
      else { setError("Sai email hoặc mật khẩu"); }
    } catch {
      setError("Lỗi kết nối, thử lại sau");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gray-950">
      <div className="w-full max-w-sm space-y-3 p-6 rounded-lg border border-cyan-500/30 bg-gray-900/70">
        <div className="text-center text-cyan-300 text-lg font-semibold">VNAI Account</div>
        {error && <div className="text-red-400 text-xs text-center">{error}</div>}
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email"
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-cyan-500" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu" type="password"
          onKeyDown={e => e.key === "Enter" && go()}
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:outline-none focus:border-cyan-500" />
        <button onClick={go} disabled={loading}
          className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded font-medium disabled:opacity-50">
          {loading ? "Đang xử lý..." : mode === "login" ? "Đăng nhập" : "Đăng ký"}
        </button>
        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
          className="w-full text-xs text-cyan-300/70 hover:text-cyan-300">
          {mode === "login" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
        </button>
      </div>
    </div>
  );
}
