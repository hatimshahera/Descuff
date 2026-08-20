export default function ContentHomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Descuff Content Fixture",
    url: "https://content.example.test"
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1>Content Library</h1>
      <form action="/api/search" method="get">
        <label htmlFor="query">Search articles</label>
        <input id="query" name="query" defaultValue="agent standards" />
        <button type="submit">Search</button>
      </form>
    </main>
  );
}
