"use server";

export async function reserveAppointment(formData: FormData) {
  return {
    reservationId: `reservation-${formData.get("slotId") ?? "unknown"}`,
    status: "held"
  };
}
