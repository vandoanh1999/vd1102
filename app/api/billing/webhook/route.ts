import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const buf = Buffer.from(await req.arrayBuffer());
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  let evt: Stripe.Event;
  try {
    evt = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (evt.type === "checkout.session.completed") {
    const email = (evt.data.object as any).metadata?.email as string;
    if (email) await prisma.user.update({ where: { email }, data: { plan: "PRO" } });
  }
  return new Response("ok");
}
