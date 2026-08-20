export function middleware() {
  return Response.next();
}

export const config = {
  matcher: ["/account/:path*", "/reservations/:path*"]
};
