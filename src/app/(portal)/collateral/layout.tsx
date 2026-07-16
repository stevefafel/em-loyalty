import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Marketing Materials",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
