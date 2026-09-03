import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { findProduct, inr } from "@/lib/data";
import { useShop } from "@/lib/shop-store";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Search = { buy?: string };

type Address = {
  id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
};

export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    buy: typeof s.buy === "string" ? s.buy : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Checkout — Jamshedpurwala" },
      {
        name: "description",
        content: "Confirm your address, review the order summary and place your Jamshedpurwala order securely.",
      },
      { property: "og:title", content: "Checkout — Jamshedpurwala" },
      { property: "og:description", content: "Review your order and place it in a few taps." },
    ],
  }),
  component: CheckoutPage,
});

const empty = { full_name: "", phone: "", line1: "", line2: "", city: "Jamshedpur", state: "Jharkhand", pincode: "" };

function CheckoutPage() {
  const { buy } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { cartLines, remove } = useShop();

  const buyProduct = buy ? findProduct(buy) : undefined;
  const lines = buyProduct ? [{ product: buyProduct, qty: 1 }] : cartLines;

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const mrpTotal = lines.reduce((s, l) => s + l.product.mrp * l.qty, 0);
  const discount = mrpTotal - subtotal;
  const delivery = subtotal >= 299 || subtotal === 0 ? 0 : 40;
  const total = subtotal + delivery;

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: buy ? `/checkout?buy=${buy}` : "/checkout" }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    setLoadingAddr(true);
    supabase
      .from("addresses")
      .select("*")
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as Address[];
        setAddresses(rows);
        setSelected(rows[0]?.id ?? null);
        setShowForm(rows.length === 0);
        setForm((f) => ({ ...f, phone: f.phone || (user.phone ? `+${user.phone.replace(/^\+/, "")}` : "") }));
      })
      .then(undefined, () => setErr("Couldn't load your addresses."))
      .finally?.(() => setLoadingAddr(false));
    setLoadingAddr(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function saveAddress() {
    if (!user) return;
    if (!form.full_name || !form.phone || !form.line1 || !form.city || !form.state || !form.pincode) {
      setErr("Please fill name, phone, address, city, state and pincode.");
      return;
    }
    setErr("");
    setSaving(true);
    const { data, error } = await supabase
      .from("addresses")
      .insert({ ...form, line2: form.line2 || null, user_id: user.id, is_default: addresses.length === 0 })
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) {
      setErr("Couldn't save the address. Please try again.");
      return;
    }
    setAddresses((a) => [data as Address, ...a]);
    setSelected((data as Address).id);
    setShowForm(false);
    setForm(empty);
  }

  async function placeOrder() {
    if (placing || !user) return;
    if (lines.length === 0) {
      setErr("Your cart is empty.");
      return;
    }
    const address = addresses.find((a) => a.id === selected);
    if (!address) {
      setErr("Please select or add a delivery address.");
      return;
    }
    setErr("");
    setPlacing(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          shipping_address: address as unknown as Record<string, unknown>,
          subtotal,
          discount,
          delivery_fee: delivery,
          total_amount: total,
          payment_method: "demo",
          payment_status: "paid_demo",
          order_status: "confirmed",
        })
        .select("id")
        .single();
      if (error || !order) throw error ?? new Error("order");

      const items = lines.map((l) => ({
        order_id: order.id,
        user_id: user.id,
        product_id: l.product.id,
        product_name: l.product.name,
        product_image: l.product.image,
        product_brand: l.product.brand,
        price: l.product.price,
        mrp: l.product.mrp,
        quantity: l.qty,
        subtotal: l.product.price * l.qty,
      }));
      const { error: itemErr } = await supabase.from("order_items").insert(items);
      if (itemErr) throw itemErr;

      // Remove purchased items from the cart (both local state and database).
      for (const l of lines) remove(l.product.id);

      toast.success("Order placed");
      navigate({ to: "/order-success/$id", params: { id: order.id }, replace: true });
    } catch {
      setPlacing(false);
      setErr("We couldn't place your order. Please try again.");
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-3 pb-10 pt-3 md:px-0 md:pt-6">
      <header className="mb-3 flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/cart" })}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border md:hidden"
        >
          <ArrowLeft size={17} className="text-foreground" />
        </button>
        <h1 className="text-[19px] font-bold tracking-tight text-foreground">Checkout</h1>
      </header>

      {lines.length === 0 ? (
        <div className="card-surface p-5 text-center">
          <p className="text-[14px] font-bold text-foreground">Nothing to checkout</p>
          <Link to="/" className="mt-2 inline-block text-[13px] font-semibold text-primary">
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Address */}
          <section className="card-surface p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <MapPin size={14} className="text-primary" /> Delivery Address
            </p>
            {loadingAddr && <p className="mt-2 text-[12px] text-muted-foreground">Loading addresses…</p>}
            <div className="mt-2 space-y-2">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-[12px] ${
                    selected === a.id ? "border-primary bg-primary-soft/40" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    checked={selected === a.id}
                    onChange={() => setSelected(a.id)}
                    className="mt-0.5"
                    aria-label={`Deliver to ${a.full_name}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      {a.full_name} · {a.phone}
                    </span>
                    <span className="block break-words text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} - {a.pincode}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {showForm ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
                <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field
                  label="House / Street"
                  value={form.line1}
                  onChange={(v) => setForm({ ...form, line1: v })}
                  span
                />
                <Field
                  label="Landmark (optional)"
                  value={form.line2}
                  onChange={(v) => setForm({ ...form, line2: v })}
                  span
                />
                <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                <Field label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
                <Field label="Pincode" value={form.pincode} onChange={(v) => setForm({ ...form, pincode: v })} />
                <div className="col-span-2 flex gap-2">
                  <button
                    onClick={saveAddress}
                    disabled={saving}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-strong text-[13px] font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />} Save address
                  </button>
                  {addresses.length > 0 && (
                    <button
                      onClick={() => setShowForm(false)}
                      className="h-9 flex-1 rounded-lg border border-border text-[13px] font-semibold text-foreground"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-primary"
              >
                <Plus size={13} /> Add new address
              </button>
            )}
          </section>

          {/* Items */}
          <section className="card-surface p-3">
            <p className="text-[13px] font-bold text-foreground">Order Summary</p>
            <div className="mt-2 space-y-2">
              {lines.map(({ product, qty }) => (
                <div key={product.id} className="flex items-center gap-2.5">
                  <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg bg-surface object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[12.5px] font-medium text-foreground">{product.name}</p>
                    <p className="text-[11px] text-muted-foreground">Qty {qty}</p>
                  </div>
                  <p className="shrink-0 text-[13px] font-bold text-foreground">{inr(product.price * qty)}</p>
                </div>
              ))}
            </div>
            <div className="mt-2.5 space-y-1 border-t border-border pt-2 text-[11.5px]">
              <Row label="Subtotal" value={inr(mrpTotal)} />
              <Row label="Discount" value={`- ${inr(discount)}`} accent />
              <Row label="Delivery" value={delivery === 0 ? "FREE" : inr(delivery)} accent={delivery === 0} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[13px] font-bold text-foreground">Total</span>
                <span className="text-[15px] font-extrabold text-foreground">{inr(total)}</span>
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="card-surface p-3">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <Wallet size={14} className="text-primary" /> Payment Method
            </p>
            <p className="mt-1.5 rounded-lg border border-border p-2.5 text-[12px] text-foreground">
              <span className="font-semibold">Demo / Test payment</span>
              <span className="block text-muted-foreground">
                No real money is charged. A live payment gateway is not connected yet.
              </span>
            </p>
          </section>

          {err && <p className="px-1 text-[12px] font-medium text-destructive">{err}</p>}

          <button
            onClick={placeOrder}
            disabled={placing}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-strong text-[14px] font-bold text-primary-foreground disabled:opacity-60"
          >
            {placing && <Loader2 size={16} className="animate-spin" />}
            {placing ? "Placing order…" : `Place Order · ${inr(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  span,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  span?: boolean;
}) {
  return (
    <label className={`block ${span ? "col-span-2" : ""}`}>
      <span className="block text-[10.5px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-9 w-full rounded-lg border border-border px-2 text-[13px] text-foreground outline-none"
      />
    </label>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-semibold text-primary" : "text-foreground"}>{value}</span>
    </div>
  );
}
