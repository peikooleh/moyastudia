import "./globals.css";
import { PrefsProvider } from "./providers";

export const metadata = {
  title: "MoyaStudia",
  description: "MoyaStudia | YouTube workspace",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap" rel="stylesheet" />
      </head>
      <body
        style={{
          fontFamily: '"Manrope", "Segoe UI", system-ui, sans-serif',
          fontWeight: 400,
          textRendering: "optimizeLegibility",
        }}
      >
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
