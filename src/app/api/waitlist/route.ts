import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  await resend.emails.send({
    from: process.env.RESEND_WAITLIST_FROM!,
    to: process.env.RESEND_WAITLIST_RECIPIENT!,
    subject: "New BRIX Waitlist Signup",
    text: `New waitlist signup: ${email}`,
  });

  return NextResponse.json({ ok: true });
}
