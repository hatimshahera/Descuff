export async function joinWaitlist(email: string) {
  return fetch("/api/waitlist", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}
