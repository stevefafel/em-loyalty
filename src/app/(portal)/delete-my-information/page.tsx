"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, ShieldCheck } from "lucide-react";

const RELATIONSHIPS = [
  { value: "shop-owner", label: "Shop Owner" },
  { value: "shop-employee", label: "Shop Employee" },
  { value: "consumer", label: "Consumer" },
  { value: "mechanic-advisor-employee", label: "Mechanic Advisor Employee" },
  { value: "other", label: "Other" },
];

export default function DeleteMyInformationPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [details, setDetails] = useState("");
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!relationship) {
      setError("Please select your relationship to the program.");
      return;
    }
    if (!attested) {
      setError("Please confirm the declaration before submitting.");
      return;
    }

    setIsSubmitting(true);

    // Simulated submission — no data leaves the browser.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    setReferenceId(
      `DEL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    );
    setIsSubmitting(false);
  };

  if (referenceId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className="text-2xl">
              <h1>Your request has been received</h1>
            </CardTitle>
            <CardDescription className="space-y-2">
              <span className="block">
                Your request to delete your personal information has been
                received. Within <strong>48 hours</strong>, your information
                will be removed from our systems.
              </span>
              <span className="block">
                A confirmation will be sent to <strong>{email}</strong>.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Reference number:{" "}
              <span className="font-mono font-semibold text-foreground">
                {referenceId}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <ShieldCheck className="h-12 w-12 text-exxon-red" />
          </div>
          <CardTitle className="text-2xl text-center">
            <h1>Delete my information</h1>
          </CardTitle>
          <CardDescription className="text-center">
            Use this form to request deletion of the personal information we
            hold about you. Under applicable privacy laws (including the
            CCPA/CPRA), you have the right to request that we delete your
            personal information, subject to certain exceptions. We will verify
            your request using the information you provide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                We use this to locate your records and to send confirmation of
                your request.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number (optional)</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">
                Your relationship to the program
              </Label>
              <Select value={relationship} onValueChange={setRelationship}>
                <SelectTrigger id="relationship" className="w-full">
                  <SelectValue placeholder="Select one" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="details">Additional details (optional)</Label>
              <Textarea
                id="details"
                placeholder="Anything that helps us locate your information, e.g. shop name or account details."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
              />
            </div>
            <label
              htmlFor="attestation"
              className="flex items-start gap-3 text-sm leading-relaxed"
            >
              <input
                id="attestation"
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-exxon-red"
              />
              <span>
                I declare under penalty of perjury that the information
                provided is true and correct, and that I am the person whose
                personal information is the subject of this request, or an
                authorized agent acting on that person&apos;s behalf.
              </span>
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-exxon-red text-white hover:bg-exxon-red-dark"
            >
              {isSubmitting ? "Submitting..." : "Submit deletion request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
