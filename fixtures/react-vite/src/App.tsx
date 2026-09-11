import { Link } from "react-router-dom";
import { ProductRoutes } from "./ProductRoutes";
import { WaitlistForm } from "./WaitlistForm";

export default function App() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "React Vite Fixture"
          })
        }}
      />
      <nav>
        <Link to="/">Home</Link>
        <Link to="/products">Products</Link>
        <a href="/about">About</a>
      </nav>
      <WaitlistForm />
      <ProductRoutes />
    </main>
  );
}
