import { Link, Route, Routes } from "react-router-dom";

export default function App() {
  async function loadProducts() {
    return fetch("/api/products");
  }

  async function joinWaitlist(email: string) {
    return fetch("/api/waitlist", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  }

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
      <form action="/api/waitlist" method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" />
        <button type="submit">Join waitlist</button>
      </form>
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route path="/products" element={<button onClick={loadProducts}>Load products</button>} />
        <Route
          path="/search"
          element={<button onClick={() => joinWaitlist("test@example.com")}>Search</button>}
        />
      </Routes>
    </main>
  );
}
