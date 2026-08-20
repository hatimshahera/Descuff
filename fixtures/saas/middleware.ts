export function middleware() {
  return Response.next();
}

export const config = {
  matcher: ["/settings/:path*", "/billing/:path*", "/api/team/:path*"]
};
