import { ProductRepository } from "./product-repository";

export default function HomePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            name: ProductRepository.displayName
          })
        }}
      />
      <form action="/api/search" method="get">
        <input name="q" />
      </form>
    </main>
  );
}
