import Stripe from "stripe";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/settings?success=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/settings?canceled=1`,
    metadata: { email: session.user.email },
  });
  return Response.json({ url: checkout.url });
}
