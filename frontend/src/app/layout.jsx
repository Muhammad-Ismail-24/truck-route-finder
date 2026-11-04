import { anton, archivo, jetbrainsMono } from "./fonts";
import "./globals.css";

export const metadata = {
  title: "HAULCAST — Weather-Aware Truck Routing",
  description: "Weather-aware truck routing web application",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-white text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
