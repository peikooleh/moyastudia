import "./globals.css";

export const metadata = {
  title: "MoyaStudia",
  description: "Кабинет выпуска YouTube",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
