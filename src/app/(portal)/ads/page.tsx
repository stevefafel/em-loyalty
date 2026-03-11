"use client";

import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  CalendarCheck,
  MessageSquare,
  Star,
  BarChart3,
  Mail,
  Phone,
} from "lucide-react";

const partners = [
  {
    name: "AutoOps",
    tagline: "The Leading Online Scheduling Tool for Auto Shops",
    description:
      "Reduce phone volume and increase bookings with online scheduling that syncs with your shop management system. Customers book 24/7 while your calendar stays organized.",
    logo: "/partners/autoops-logo-primary.png",
    url: "https://autoops.com",
    color: "red" as const,
    features: [
      { icon: CalendarCheck, text: "Real-time online scheduling" },
      { icon: MessageSquare, text: "Automated text reminders" },
      { icon: Star, text: "20+ shop management integrations" },
    ],
  },
  {
    name: "Steer",
    tagline: "Turn Every Customer Into a Repeat Customer",
    description:
      "The CRM trusted by auto repair shops. Handle online bookings, texts, reminders, reviews, promotions, call tracking, and insights all from one place.",
    logo: "/partners/steer-logo.svg",
    url: "https://steer.io",
    color: "blue" as const,
    features: [
      { icon: Mail, text: "Marketing automation & campaigns" },
      { icon: Phone, text: "Call tracking & analytics" },
      { icon: BarChart3, text: "Customer retention insights" },
    ],
  },
];

const colorMap = {
  red: {
    border: "border-exxon-red/20",
    badgeBg: "bg-red-50 text-exxon-red border-exxon-red/30",
    button: "border-exxon-red text-exxon-red hover:bg-exxon-red hover:text-white",
    featureIcon: "text-exxon-red",
    headerBg: "bg-gradient-to-br from-red-50 to-white",
  },
  blue: {
    border: "border-exxon-blue/20",
    badgeBg: "bg-blue-50 text-exxon-blue border-exxon-blue/30",
    button: "border-exxon-blue text-exxon-blue hover:bg-exxon-blue hover:text-white",
    featureIcon: "text-exxon-blue",
    headerBg: "bg-gradient-to-br from-blue-50 to-white",
  },
};

export default function AdsPage() {
  const { isApproved, isLoading } = useEnrollmentGuard();

  if (isLoading || !isApproved) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-exxon-charcoal">
          Ads & Partners
        </h1>
        <p className="mt-2 text-muted-foreground">
          Exclusive tools and services from our partners to help grow your shop.
          As a Mobil 1 Premium Growth member, you get preferred access.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {partners.map((partner) => {
          const colors = colorMap[partner.color];
          return (
            <Card
              key={partner.name}
              className={`overflow-hidden border-2 ${colors.border} transition-shadow hover:shadow-lg`}
            >
              {/* Logo header */}
              <div
                className={`flex h-32 items-center justify-center px-8 ${colors.headerBg}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logo}
                  alt={`${partner.name} logo`}
                  className="max-h-16 w-auto object-contain"
                />
              </div>

              <CardContent className="space-y-5 p-6">
                {/* Title + tagline */}
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-exxon-charcoal">
                      {partner.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className={colors.badgeBg}
                    >
                      Partner
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {partner.tagline}
                  </p>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {partner.description}
                </p>

                {/* Features */}
                <div className="space-y-3">
                  {partner.features.map((feature) => (
                    <div
                      key={feature.text}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 ${colors.featureIcon}`}
                      >
                        <feature.icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm text-exxon-charcoal">
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  variant="outline"
                  className={`w-full transition-colors ${colors.button}`}
                  onClick={() => window.open(partner.url, "_blank")}
                >
                  Visit {partner.name}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
