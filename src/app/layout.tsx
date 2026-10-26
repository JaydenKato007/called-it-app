import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: "Called It — how well do you know your people?",
  description: "A playful, long-running prediction game for your group chat. Bet points on what your friends and family will actually do.",
  openGraph: {
    title: "Called It",
    description: "Make predictions about your people. Put points on the line. Wait for reality to expose everybody.",
    type: "website"
  }
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
