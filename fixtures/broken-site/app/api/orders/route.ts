export async function POST() {
  return Response.json({ orderId: "order-without-auth" });
}
