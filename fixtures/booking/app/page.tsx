import { reserveAppointment } from "./reservation-actions";

export default function BookingHomePage() {
  return (
    <main>
      <h1>Appointment Booking</h1>
      <form action="/api/availability" method="get">
        <label htmlFor="service">Service</label>
        <input id="service" name="service" defaultValue="consultation" />
        <button type="submit">Find Availability</button>
      </form>
      <form action={reserveAppointment}>
        <input name="slotId" defaultValue="slot-morning" />
        <button type="submit">Reserve Slot</button>
      </form>
    </main>
  );
}
