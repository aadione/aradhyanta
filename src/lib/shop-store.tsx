import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { allProducts, type Product } from "./data";

type CartLine = { id: string; qty: number };

type ShopCtx = {
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  cartLines: { product: Product; qty: number }[];
  add: (id: string) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  wishlist: string[];
  toggleWish: (id: string) => void;
  notifications: number;
};

const Ctx = createContext<ShopCtx | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const c = localStorage.getItem("jw-cart");
      const w = localStorage.getItem("jw-wish");
      if (c) setCart(JSON.parse(c));
      if (w) setWishlist(JSON.parse(w));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("jw-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    localStorage.setItem("jw-wish", JSON.stringify(wishlist));
  }, [wishlist]);

  const value = useMemo<ShopCtx>(() => {
    const lines = cart
      .map((l) => {
        const product = allProducts.find((p) => p.id === l.id);
        return product ? { product, qty: l.qty } : null;
      })
      .filter(Boolean) as { product: Product; qty: number }[];

    return {
      cart,
      cartCount: cart.reduce((s, l) => s + l.qty, 0),
      cartTotal: lines.reduce((s, l) => s + l.product.price * l.qty, 0),
      cartLines: lines,
      add: (id) =>
        setCart((prev) =>
          prev.some((l) => l.id === id)
            ? prev.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
            : [...prev, { id, qty: 1 }],
        ),
      remove: (id) => setCart((prev) => prev.filter((l) => l.id !== id)),
      setQty: (id, qty) =>
        setCart((prev) =>
          qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l)),
        ),
      wishlist,
      toggleWish: (id) =>
        setWishlist((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id])),
      notifications: 3,
    };
  }, [cart, wishlist]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  return ctx;
}
