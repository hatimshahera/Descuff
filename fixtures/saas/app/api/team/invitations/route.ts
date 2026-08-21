function parseRequest() {
  return { auth: { userId: "user-demo" } };
}

function canUpdateTeam() {
  return true;
}

export async function POST() {
  const { auth } = parseRequest();
  if (!canUpdateTeam()) {
    return Response.json({ error: "Unauthorized", userId: auth.userId }, { status: 401 });
  }

  return Response.json({ invitationId: "invite-preview", status: "queued" });
}
