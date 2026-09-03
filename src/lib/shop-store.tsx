import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { allProducts, type Product } from "./data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

type CartLine = { id: string; qty: number };

type ShopCtx = {
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  cartLines: { product: Product; qty: number }[];
  add: (id: string) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clearCart: () => void;
  wishlist: string[];
  toggleWish: (id: string) => void;
  notifications: number;
};

const Ctx = createContext<ShopCtx | null>(null);

async function ensureCartId(userId: string): Promise<string | null> {
  const existing = await supabase.from("carts").select("id").eq("user_id", userId).limit(1).maybeSingle();
  if (existing.data?.id) return existing.data.id;
  const created = await supabase.from("carts").insert({ user_id: userId }).select("id").single();
  return created.data?.id ?? null;
}

function itemPayload(userId: string, cartId: string, line: CartLine) {
  const p = allProducts.find((x) => x.id === line.id);
  return {
    cart_id: cartId,
    user_id: userId,
    product_id: line.id,
    quantity: line.qty,
    product_name: p?.name ?? null,
    product_image: p?.image ?? null,
    product_brand: p?.brand ?? null,
    price: p?.price ?? null,
    mrp: p?.mrp ?? null,
  };
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const cartIdRef = useRef<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const c = localStorage.getItem("jw-cart");
      const w = localStorage.getItem("jw-wish");
      if (c) setCart(JSON.parse(c));
      if (w) setWishlist(JSON.parse(w));
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    localStorage.setItem("jw-cart", JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    localStorage.setItem("jw-wish", JSON.stringify(wishlist));
  }, [wishlist]);

  // Merge the guest cart into the user's persistent cart on sign in.
  useEffect(() => {
    if (!user) {
      cartIdRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cartId = await ensureCartId(user.id);
        if (!cartId || cancelled) return;
        cartIdRef.current = cartId;
        const { data } = await supabase
          .from("cart_items")
          .select("product_id, quantity")
          .eq("user_id", user.id);
        const remote: CartLine[] = (data ?? []).map((r) => ({ id: r.product_id, qty: r.quantity }));
        const local = JSON.parse(localStorage.getItem("jw-cart") || "[]") as CartLine[];
        const merged = [...remote];
        for (const l of local) {
          const hit = merged.find((m) => m.id === l.id);
          if (hit) hit.qty = Math.max(hit.qty, l.qty);
          else merged.push(l);
        }
        if (cancelled) return;
        setCart(merged);
        if (merged.length) {
          await supabase
            .from("cart_items")
            .upsert(
              merged.map((l) => itemPayload(user.id, cartId, l)),
              { onConflict: "cart_id,product_id" },
            );
        }
      } catch {
        /* keep local cart working */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persist = (line: CartLine | null, removedId?: string) => {
    const userId = user?.id;
    const cartId = cartIdRef.current;
    if (!userId || !cartId) return;
    (async () => {
      try {
        if (removedId) {
          await supabase.from("cart_items").delete().eq("user_id", userId).eq("product_id", removedId);
        } else if (line) {
          await supabase
            .from("cart_items")
            .upsert([itemPayload(userId, cartId, line)], { onConflict: "cart_id,product_id" });
        }
      } catch {
        /* ignore */
      }
    })();
  };

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
      add: (id) => {
        setCart((prev) => {
          const hit = prev.find((l) => l.id === id);
          const next = hit
            ? prev.map((l) => (l.id === id ? { ...l, qty: l.qty + 1 } : l))
            : [...prev, { id, qty: 1 }];
          persist(next.find((l) => l.id === id)!);
          return next;
        });
      },
      remove: (id) => {
        persist(null, id);
        setCart((prev) => prev.filter((l) => l.id !== id));
      },
      setQty: (id, qty) => {
        if (qty <= 0) {
          persist(null, id);
          setCart((prev) => prev.filter((l) => l.id !== id));
          return;
        }
        persist({ id, qty });
        setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)));
      },
      clearCart: () => setCart([]),
      wishlist,
      toggleWish: (id) =>
        setWishlist((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id])),
      notifications: 3,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, wishlist, user?.id]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  return ctx;
}
