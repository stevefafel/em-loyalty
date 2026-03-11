"use client";

import { useShop } from "@/context/shop-context";
import { useEnrollmentGuard } from "@/hooks/use-enrollment-guard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, ShoppingBag } from "lucide-react";
import { SWAG_ITEMS } from "@/lib/swag-items";
import { toast } from "sonner";

export default function SwagShopPage() {
  const { activeShop } = useShop();
  const { isApproved, isLoading } = useEnrollmentGuard();

  if (isLoading || !isApproved) return null;

  const balance = activeShop?.loyalty_points_balance || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-exxon-charcoal">
            Swag Shop
          </h1>
          <p className="text-muted-foreground mt-1">
            Redeem your premium growth points for Mobil 1 merchandise
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-exxon-red/10 px-4 py-2">
          <Award className="h-5 w-5 text-exxon-red" />
          <span className="font-bold text-exxon-charcoal">{balance}</span>
          <span className="text-sm text-muted-foreground">points</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SWAG_ITEMS.map((item) => {
          const canAfford = balance >= item.pointsCost;
          return (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                <div className="flex h-32 items-center justify-center rounded-lg bg-gray-100">
                  <ShoppingBag className="h-12 w-12 text-exxon-gray-light" />
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardTitle className="text-lg">{item.name}</CardTitle>
                <CardDescription className="mt-2">
                  {item.description}
                </CardDescription>
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <Badge
                  variant="outline"
                  className="border-exxon-red text-exxon-red"
                >
                  {item.pointsCost} points
                </Badge>
                <Button
                  size="sm"
                  disabled={!canAfford}
                  className="bg-exxon-red text-white hover:bg-exxon-red-dark"
                  onClick={() =>
                    toast.success("Redemption coming soon!", {
                      description: `${item.name} will be available for redemption in the full release.`,
                    })
                  }
                >
                  {canAfford ? "Redeem" : "Not enough points"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
