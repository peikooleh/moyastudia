import Link from "next/link";
export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-back">← MoyaStudia</Link>
      <h1>Terms</h1>
      <p>MoyaStudia is currently a channel-management workspace under development.</p>
      <h2>Current capabilities</h2>
      <p>The current YouTube integration is read-only. Controls marked for Write Mode are previews and do not publish changes to YouTube.</p>
      <h2>Your account</h2>
      <p>You are responsible for the Google and YouTube accounts you choose to connect and for keeping access to those accounts secure.</p>
      <h2>Availability</h2>
      <p>Features, cached data, and integrations may change while the product is under development.</p>
      <p className="legal-note">This page is a product-information placeholder and should be reviewed before public launch.</p>
    </main>
  );
}
