"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PRINTER_OPTIONS,
  PRINTER_OTHER_MAX,
  type PrinterOption,
} from "@/lib/validators/register";
import { CheckCircle } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    shop_name: "",
    shop_address: "",
    shop_city: "",
    shop_state: "",
    printer_type: "" as PrinterOption | "",
    printer_other: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        printer_other:
          form.printer_type === "Other" ? form.printer_other : undefined,
      }),
    });

    if (res.ok) {
      setSubmitted(true);
      return;
    }

    const data = await res.json().catch(() => null);
    if (typeof data?.error === "string") {
      setError(data.error);
    } else {
      setError("Please double-check the form and try again.");
    }
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-exxon-charcoal px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mb-4 flex justify-center">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">
              <h1>Registration received</h1>
            </CardTitle>
            <CardDescription>
              Thanks for registering! We&apos;ll review your request and email
              you a link to set up your account, usually within{" "}
              <strong>24 business hours</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
            >
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-exxon-charcoal px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mobil1-logo.svg" alt="Mobil 1" className="mx-auto mb-2 h-10" />
          <CardTitle className="text-2xl">
            <h1>Register for a new account</h1>
          </CardTitle>
          <CardDescription>
            Tell us about you and your shop to join the Premium Growth Portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First name</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => set("first_name")(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last name</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => set("last_name")(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email")(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop_name">Shop name</Label>
              <Input
                id="shop_name"
                value={form.shop_name}
                onChange={(e) => set("shop_name")(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shop_address">Shop address</Label>
              <Input
                id="shop_address"
                value={form.shop_address}
                onChange={(e) => set("shop_address")(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop_city">City</Label>
                <Input
                  id="shop_city"
                  value={form.shop_city}
                  onChange={(e) => set("shop_city")(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop_state">State</Label>
                <Select
                  value={form.shop_state}
                  onValueChange={set("shop_state")}
                >
                  <SelectTrigger id="shop_state">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="printer_type">
                What kind of oil change sticker printer do you use?
              </Label>
              <Select
                value={form.printer_type}
                onValueChange={(v) => {
                  set("printer_type")(v);
                  if (v !== "Other") set("printer_other")("");
                }}
              >
                <SelectTrigger id="printer_type">
                  <SelectValue placeholder="Select a printer" />
                </SelectTrigger>
                <SelectContent>
                  {PRINTER_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.printer_type === "Other" && (
              <div className="space-y-2">
                <Label htmlFor="printer_other">Which printer?</Label>
                <Input
                  id="printer_other"
                  maxLength={PRINTER_OTHER_MAX}
                  value={form.printer_other}
                  onChange={(e) => set("printer_other")(e.target.value)}
                  placeholder="Printer make/model"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {form.printer_other.length}/{PRINTER_OTHER_MAX}
                </p>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
            >
              {isSubmitting ? "Submitting..." : "Register"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-exxon-red">
                Log in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
