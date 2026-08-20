export default function WorkspaceSettingsPage() {
  return (
    <main>
      <h1>Team Settings</h1>
      <form action="/api/team/invitations" method="post">
        <label htmlFor="email">Invite email</label>
        <input id="email" name="email" defaultValue="member@example.test" />
        <button type="submit">Invite Member</button>
      </form>
    </main>
  );
}
