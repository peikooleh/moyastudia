export const metadata = {
  title: "MoyaStudia",
  description: "Кабинет выпуска YouTube",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          fontFamily: "Segoe UI, system-ui, sans-serif",
          background: "#0f1115",
          color: "#e8eaed",
        }}
      >
        {children}
      </body>
    </html>
  );
}
