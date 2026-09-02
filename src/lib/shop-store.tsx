import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { allProducts, type Product } from "./data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

type CartLine = { id: string; qty: number };

type ShopCtx = {
  cart: CartLine[];
  cartCount: number;
  cartSubtotal: number;
  cartTotal: number;
  cartLines: { product: Product; qty: number }[];
  syncing: boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clearCart: (ids?: string[]) => Promise<void>;
  wishlist: string[];
  toggleWish: (id: string) => void;
  notifications: number;
};

const Ctx = createContext<ShopCtx | null>(null);

const LS_CART = "jw-cart";
const LS_WISH = "jw-wish";

async function ensureCartId(userId: string) {
  const { data } = await supabase.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

function snapshot(id: string) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return { product_id: id };
  return {
    product_id: id,
    product_name: p.name,
    product_image: p.image,
    product_brand: p.brand,
    shop_name: p.store ?? p.brand,
    price: p.price,
    mrp: p.mrp,
  };
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const cartIdRef = useRef<string | null>(null);
  const hydrated = useRef(false);

  // hydrate guest cart from localStorage
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CART);
      const w = localStorage.getItem(LS_WISH);
      if (c) setCart(JSON.parse(c));
      if (w) setWishlist(JSON.parse(w));
    } catch {
      /* ignore */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) localStorage.setItem(LS_CART, JSON.stringify(cart));
  }, [cart]);
  useEffect(() => {
    if (hydrated.current) localStorage.setItem(LS_WISH, JSON.stringify(wishlist));
  }, [wishlist]);

  // On login: merge guest cart into the user's saved cart, then use the server copy.
  useEffect(() => {
    if (!user) {
      cartIdRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const cartId = await ensureCartId(user.id);
        cartIdRef.current = cartId;
        const { data: rows } = await supabase
          .from("cart_items")
          .select("product_id, quantity")
          .eq("cart_id", cartId);

        const server = new Map((rows ?? []).map((r) => [r.product_id, r.quantity]));
        const guest = JSON.parse(localStorage.getItem(LS_CART) || "[]") as CartLine[];

        for (const line of guest) {
          const qty = (server.get(line.id) ?? 0) + line.qty;
          server.set(line.id, qty);
          await supabase
            .from("cart_items")
            .upsert(
              { cart_id: cartId, user_id: user.id, quantity: qty, ...snapshot(line.id) },
              { onConflict: "cart_id,product_id" },
            );
        }
        if (cancelled) return;
        setCart([...server.entries()].map(([id, qty]) => ({ id, qty })));
      } catch (e) {
        console.error("cart sync failed", e);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<ShopCtx>(() => {
    const lines = cart
      .map((l) => {
        const product = allProducts.find((p) => p.id === l.id);
        return product ? { product, qty: l.qty } : null;
      })
      .filter(Boolean) as { product: Product; qty: number }[];

    const persistQty = async (id: string, qty: number) => {
      if (!user) return;
      try {
        const cartId = cartIdRef.current ?? (await ensureCartId(user.id));
        cartIdRef.current = cartId;
        if (qty <= 0) {
          await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("product_id", id);
        } else {
          await supabase
            .from("cart_items")
            .upsert(
              { cart_id: cartId, user_id: user.id, quantity: qty, ...snapshot(id) },
              { onConflict: "cart_id,product_id" },
            );
        }
      } catch (e) {
        console.error("cart update failed", e);
      }
    };

    const setLine = (id: string, qty: number) => {
      setCart((prev) =>
        qty <= 0
          ? prev.filter((l) => l.id !== id)
          : prev.some((l) => l.id === id)
            ? prev.map((l) => (l.id === id ? { ...l, qty } : l))
            : [...prev, { id, qty }],
      );
      void persistQty(id, qty);
    };

    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);

    return {
      cart,
      cartCount: cart.reduce((s, l) => s + l.qty, 0),
      cartSubtotal: subtotal,
      cartTotal: subtotal,
      cartLines: lines,
      syncing,
      add: (id) => {
        const current = cart.find((l) => l.id === id)?.qty ?? 0;
        setLine(id, current + 1);
      },
      remove: (id) => setLine(id, 0),
      setQty: (id, qty) => setLine(id, qty),
      clearCart: async (ids) => {
        setCart((prev) => (ids ? prev.filter((l) => !ids.includes(l.id)) : []));
        if (!user) return;
        const cartId = cartIdRef.current;
        if (!cartId) return;
        const q = supabase.from("cart_items").delete().eq("cart_id", cartId);
        if (ids) await q.in("product_id", ids);
        else await q.neq("product_id", "__none__");
      },
      wishlist,
      toggleWish: (id) =>
        setWishlist((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id])),
      notifications: 3,
    };
  }, [cart, wishlist, syncing, user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  return ctx;
}

export const deliveryFeeFor = (subtotal: number) => (subtotal >= 299 || subtotal === 0 ? 0 : 40);
