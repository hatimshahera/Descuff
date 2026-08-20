export async function GET() {
  return Response.json({
    slots: [
      { id: "slot-morning", label: "9:00 AM" },
      { id: "slot-afternoon", label: "2:00 PM" }
    ]
  });
}

export async function POST() {
  return Response.json({ reservationId: "reservation-preview", status: "held" });
}
