import { NextResponse, type NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";

// Every page and API route sits behind the shared password when APP_PASSWORD is set:
// each job spends Anthropic, ElevenLabs, Gemini and Daytona credits.
export function proxy(request: NextRequest) {
  if (isAuthorized(request.headers.get("authorization"), process.env.APP_PASSWORD)) return NextResponse.next();
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Music Swap", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
