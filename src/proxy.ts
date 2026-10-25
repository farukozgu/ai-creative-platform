import createMiddleware from "next-intl/middleware";
import {type NextRequest, NextResponse} from "next/server";

import {routing} from "@/i18n/routing";
import {updateSession} from "@/lib/supabase/proxy";
import {getInvalidPersistedSupabaseAuthCookieNames} from "@/lib/supabase/persisted-auth-cookie";

const intlMiddleware = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);
  const invalidAuthCookies = getInvalidPersistedSupabaseAuthCookieNames(request.cookies.getAll());

  // Do this before Supabase reads cookies. A partial persisted auth chunk is
  // not a valid session and must not make /dashboard fail during JSON parsing.
  invalidAuthCookies.forEach((name) => request.cookies.delete(name));

  try {
    const supabaseResponse = await updateSession(request);

    supabaseResponse.cookies.getAll().forEach(({name, value, ...options}) => {
      response.cookies.set(name, value, options);
    });

    ["cache-control", "expires", "pragma"].forEach((header) => {
      const value = supabaseResponse.headers.get(header);

      if (value) {
        response.headers.set(header, value);
      }
    });
  } catch (error) {
    // A temporary auth outage must not make public pages unavailable. Protected
    // routes still verify the session in their server components.
    console.error("Unable to refresh the Supabase session in proxy.", error);
  }

  invalidAuthCookies.forEach((name) => {
    response.cookies.set(name, "", {maxAge: 0, path: "/"});
  });

  return response ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|trpc|_vercel|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
