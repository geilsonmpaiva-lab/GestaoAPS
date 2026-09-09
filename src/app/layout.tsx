import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";
import { WebMcpTools } from "@/components/webmcp-tools";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_ORIGIN || "http://localhost:3000"),
  title: { default: "SGC UBS", template: "%s · SGC UBS" },
  description: "Gestão do conhecimento e apoio à gestão integrada de Unidades Básicas de Saúde.",
  applicationName: "SGC UBS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SGC UBS" },
  openGraph: {
    title: "SGC UBS",
    description: "Conhecimento que vira ação na gestão integrada da UBS.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SGC UBS — Conhecimento que vira ação" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "SGC UBS",
    description: "Conhecimento que vira ação na gestão integrada da UBS.",
    images: ["/og.png"]
  }
};

export const viewport: Viewport = {
  themeColor: "#f4f7f2",
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister />
        <WebMcpTools />
        {children}
      </body>
    </html>
  );
}
