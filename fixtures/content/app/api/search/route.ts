export async function GET() {
  return Response.json({
    articles: [{ slug: "agent-readable-websites", title: "Agent Readable Websites" }]
  });
}
