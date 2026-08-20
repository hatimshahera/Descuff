export async function GET() {
  return Response.json({
    workspace: { id: "workspace-demo", plan: "team" }
  });
}
