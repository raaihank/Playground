import { NextResponse } from "next/server";
import { ACCESS_COOKIE, expectedAccessCode } from "@/lib/access";

export async function POST(request: Request) {
  const expected = expectedAccessCode();
  if (!expected) {
    return NextResponse.json(
      { error: "Access code is not configured on the server." },
      { status: 500 },
    );
  }

  let code = "";
  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (code !== expected) {
    return NextResponse.json({ error: "Incorrect access code." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
