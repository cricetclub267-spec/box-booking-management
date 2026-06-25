import type { Metadata } from "next";
import "./globals.css";
import { ToastContainer } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "360 Club Box Management Dashboard",
  description: "Manage cricket turf bookings, payments, and customers with ease",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground flex flex-col">
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
