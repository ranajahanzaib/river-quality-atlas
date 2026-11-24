import { Providers } from "@/components/Providers";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiverQualityAtlas — Water chemistry alongside river flow",
  description:
    "Explore Caravan-Qual water chemistry observations in their river-flow context.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
