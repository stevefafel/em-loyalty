"use client";

import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const partners = [
  {
    name: "AutoOps",
    logo: "/partners/autoops-logo.png",
    description:
      "The #1 online scheduling tool for auto shops. Fully customizable with 50+ settings — adjust branding, diagnostic questions, and more. Show live calendar availability and push appointments directly to your shop management system. Upsell declined work, get appointments through Google Search and Maps, recognize returning customers, and allow photo/video uploads. Works with all web hosts and marketing agencies.",
    highlight: "#1 Online Scheduling Tool for Auto Shops",
    loginUrl: "https://dashboard.autoops.com",
  },
  {
    name: "Steer",
    logo: "/partners/steer-logo.svg",
    description:
      "Steer helps auto repair shops drive repeat business with automated customer communication. Send service reminders, thank-you messages, and targeted promotions to keep customers coming back. Increase retention, boost reviews, and grow revenue with smart marketing built for auto shops.",
    highlight: "Automated Customer Retention for Auto Shops",
    loginUrl: "https://app.steercrm.com",
  },
];

export default function PartnersPage() {
  const { isApproved, isLoading } = useEnrollmentGuard();

  if (isLoading || !isApproved) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-exxon-charcoal">Technology Providers</h1>
      <p className="text-muted-foreground">
        Access exclusive partner tools and discounts available to Premium Growth members.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        {partners.map((partner) => (
          <Card key={partner.name} className="flex flex-col">
            <CardHeader>
              <div className="flex h-20 items-center justify-center rounded-lg bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="h-10 object-contain"
                />
              </div>
              <CardTitle className="mt-4">{partner.name}</CardTitle>
              <CardDescription>{partner.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-end gap-4">
              <p className="text-sm font-medium text-exxon-red">
                {partner.highlight}
              </p>
              <Button
                className="w-full bg-exxon-blue text-white hover:bg-exxon-blue/90"
                onClick={() => window.open(partner.loginUrl, "_blank")}
              >
                Log in to {partner.name}
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}
