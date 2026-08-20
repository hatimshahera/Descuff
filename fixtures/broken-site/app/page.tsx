export default function BrokenHomePage() {
  return (
    <main>
      <h1>Broken Fixture</h1>
      <form action="/api/missing" method="post">
        <input name="query" defaultValue="unmatched" />
        <button type="submit">Submit Missing API</button>
      </form>
    </main>
  );
}
