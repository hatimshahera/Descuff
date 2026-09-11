import { Route, Routes } from "react-router-dom";
import { ProductButton } from "./ProductButton";

export function ProductRoutes() {
  return (
    <Routes>
      <Route path="/" element={<h1>Home</h1>} />
      <Route path="/products" element={<ProductButton />} />
      <Route path="/search" element={<h1>Search</h1>} />
    </Routes>
  );
}
