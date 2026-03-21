import { promises as fs } from "fs";
import { basename, join } from "path";

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files") as File[];
  if (!files.length) return new Response("No files", { status: 400 });
  const saved: string[] = [];
  await fs.mkdir("./uploads", { recursive: true });
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const name = `${Date.now()}_${f.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
    const p = join("./uploads", name);
    await fs.writeFile(p, buf);
    saved.push("/uploads/" + basename(p));
  }
  return Response.json({ ok: true, files: saved });
}
