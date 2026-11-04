import type { Metadata } from "next";
import { Gabarito, Poppins } from "next/font/google";
import "./globals.css";

// Typographies de la charte Invox : Gabarito (titres), Poppins (texte).
const gabarito = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Vérification Emails",
  description:
    "Vérifiez qu'un fichier de contacts Excel associe chaque email au bon site et à la bonne entreprise.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={`${gabarito.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-base text-fg-body">
        {children}
      </body>
    </html>
  );
}
