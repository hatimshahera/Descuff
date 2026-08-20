export async function GET() {
  return Response.json({ products: [] });
}

export async function POST() {
  return Response.json({ ok: true });
}
