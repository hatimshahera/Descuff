export function ProductButton() {
  async function loadProducts() {
    return fetch("/api/products");
  }

  return <button onClick={loadProducts}>Load products</button>;
}
