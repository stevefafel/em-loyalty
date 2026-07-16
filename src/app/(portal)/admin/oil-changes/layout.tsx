import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oil Change Tracking",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
