export function WaitlistForm() {
  return (
    <form action="/api/waitlist" method="post">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" />
      <button type="submit">Join waitlist</button>
    </form>
  );
}
