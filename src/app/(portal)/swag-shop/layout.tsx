import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Swag Shop",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
