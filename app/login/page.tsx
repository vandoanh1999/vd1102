import { redirect } from "next/navigation";

// Tạm thời không cần đăng nhập: ai vào cũng chat được ngay.
export default function Login() {
  redirect("/");
}
